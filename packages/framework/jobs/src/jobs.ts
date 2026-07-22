import { HOUR, parseJson } from "@iedora/common"
import postgres, { type Sql } from "postgres"

import { SCHEDULED_JOBS_DDL } from "./schema.ts"

/** A job to enqueue. */
export interface JobInput {
  /** Handler name — must have a matching entry in `handlers`. */
  kind: string
  /** When the job becomes due. */
  runAt: Date
  /** Arbitrary JSON object passed to the handler. */
  payload?: object
  /**
   * Groups related jobs so they can be cancelled together (e.g. `lesson:<id>`).
   * `cancelByKey` cancels every pending job sharing the key.
   */
  key?: string
  /** Retries before the job is marked failed. Defaults to `defaultMaxAttempts`. */
  maxAttempts?: number
}

/** What a handler receives when its job runs. */
export interface JobContext {
  readonly kind: string
  /** The job's JSON payload. Narrow it in the handler (e.g. `payload as MyShape`). */
  readonly payload: unknown
  /** 1-based attempt number (1 on first run, 2 after one retry, …). */
  readonly attempt: number
  readonly key: string | null
  /**
   * Enqueue a follow-up job — the durable equivalent of "sleep, then do the next
   * step". Reuse the same `key` so a later cancel reaches the whole chain.
   */
  schedule(input: JobInput): Promise<string>
}

/** An async unit of work. Must be idempotent: a job can run more than once. */
export type JobHandler = (ctx: JobContext) => Promise<void>

export interface JobsOptions {
  /** Postgres connection string. The runner owns its own small pool. */
  connectionString: string
  /** Map of `kind` → handler. */
  handlers: Record<string, JobHandler>
  /** Poll cadence in ms. Default 5000. */
  pollIntervalMs?: number
  /** Max jobs claimed per poll. Default 20. */
  batchSize?: number
  /** Retries before a job is failed, unless overridden per job. Default 5. */
  defaultMaxAttempts?: number
  /**
   * A job left `running` longer than this is presumed crashed and reclaimed.
   * Handlers must be idempotent because a reclaimed job runs again. Default 5 min.
   */
  reclaimAfterMs?: number
  /** Delay before retry `attempt` (1-based). Default: min(1h, 30s·2^(attempt-1)). */
  backoff?: (attempt: number) => number
  /** Observe failures (logging/metrics). */
  onError?: (error: unknown, job?: { id: string; kind: string }) => void
  /** Injectable clock, for tests. Default `() => new Date()`. */
  now?: () => Date
}

export interface Jobs {
  /** Enqueue a job. Resolves with its id. */
  schedule(input: JobInput): Promise<string>
  /** Cancel every still-pending job with this key. Resolves with the count cancelled. */
  cancelByKey(key: string): Promise<number>
  /** Run one poll immediately; resolves with the number of jobs processed. Mainly for tests. */
  runOnce(): Promise<number>
  /** Begin polling on an interval. */
  start(): void
  /** Stop polling, let an in-flight poll finish, and close the pool. */
  stop(): Promise<void>
  /** Create the `scheduled_jobs` table if missing. For tests/dev; prod uses a migration. */
  ensureSchema(): Promise<void>
}

interface ClaimedJob {
  id: string
  kind: string
  payload: unknown
  attempt: number
  maxAttempts: number
  key: string | null
}

const defaultBackoff = (attempt: number): number => Math.min(HOUR, 30_000 * 2 ** (attempt - 1))

/**
 * A durable job scheduler backed by a single Postgres table. Jobs are claimed
 * with `FOR UPDATE SKIP LOCKED`, so any number of processes can poll the same
 * table without running a job twice; a crashed worker's in-flight jobs are
 * reclaimed after `reclaimAfterMs`.
 */
export function createJobs(options: JobsOptions): Jobs {
  const {
    handlers,
    pollIntervalMs = 5_000,
    batchSize = 20,
    defaultMaxAttempts = 5,
    reclaimAfterMs = 5 * 60_000,
    backoff = defaultBackoff,
    onError = () => {},
    now = () => new Date(),
  } = options

  const sql: Sql = postgres(options.connectionString, { max: 4 })

  let timer: ReturnType<typeof setInterval> | undefined
  let polling = false
  let stopped = false

  const schedule: Jobs["schedule"] = async (input) => {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO scheduled_jobs (kind, run_at, payload, dedupe_key, max_attempts)
      VALUES (
        ${input.kind}, ${input.runAt}, ${JSON.stringify(input.payload ?? {})}::jsonb,
        ${input.key ?? null}, ${input.maxAttempts ?? defaultMaxAttempts}
      )
      RETURNING id`
    const row = rows[0]
    if (!row) throw new Error("scheduled_jobs insert returned no row")
    return row.id
  }

  const cancelByKey: Jobs["cancelByKey"] = async (key) => {
    const result = await sql`
      UPDATE scheduled_jobs SET status = 'cancelled', updated_at = now()
      WHERE dedupe_key = ${key} AND status = 'pending'`
    return result.count
  }

  // One atomic claim: flip due (or crash-stranded) rows to 'running' and return
  // them. SKIP LOCKED means concurrent pollers never contend for the same rows.
  const claim = async (): Promise<ClaimedJob[]> => {
    const staleBefore = new Date(now().getTime() - reclaimAfterMs)
    const rows = await sql<ClaimedJob[]>`
      UPDATE scheduled_jobs
      SET status = 'running', locked_at = now(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM scheduled_jobs
        WHERE (status = 'pending' AND run_at <= ${now()})
           OR (status = 'running' AND locked_at < ${staleBefore})
        ORDER BY run_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      RETURNING id, kind, payload, attempts AS attempt, max_attempts AS "maxAttempts", dedupe_key AS key`
    return rows.map((r) => ({ ...r, payload: parseJson(r.payload) }))
  }

  const finishOk = (id: string) =>
    sql`UPDATE scheduled_jobs SET status = 'done', updated_at = now() WHERE id = ${id}`

  const finishErr = async (job: ClaimedJob, error: unknown): Promise<void> => {
    const message = error instanceof Error ? error.message : String(error)
    if (job.attempt >= job.maxAttempts) {
      await sql`UPDATE scheduled_jobs SET status = 'failed', last_error = ${message}, updated_at = now() WHERE id = ${job.id}`
    } else {
      const retryAt = new Date(now().getTime() + backoff(job.attempt))
      await sql`UPDATE scheduled_jobs SET status = 'pending', run_at = ${retryAt}, last_error = ${message}, updated_at = now() WHERE id = ${job.id}`
    }
    onError(error, { id: job.id, kind: job.kind })
  }

  const run = async (job: ClaimedJob): Promise<void> => {
    const handler = handlers[job.kind]
    if (!handler) {
      await finishErr(job, new Error(`no handler registered for kind '${job.kind}'`))
      return
    }
    try {
      await handler({ kind: job.kind, payload: job.payload, attempt: job.attempt, key: job.key, schedule })
      await finishOk(job.id)
    } catch (error) {
      await finishErr(job, error)
    }
  }

  const runOnce: Jobs["runOnce"] = async () => {
    if (polling || stopped) return 0
    polling = true
    try {
      const claimed = await claim()
      for (const job of claimed) await run(job)
      return claimed.length
    } catch (error) {
      onError(error)
      return 0
    } finally {
      polling = false
    }
  }

  return {
    schedule,
    cancelByKey,
    runOnce,
    ensureSchema: () => sql.unsafe(SCHEDULED_JOBS_DDL).then(() => undefined),
    start() {
      timer ??= setInterval(() => void runOnce(), pollIntervalMs)
    },
    async stop() {
      stopped = true
      if (timer) {
        clearInterval(timer)
        timer = undefined
      }
      while (polling) await new Promise((resolve) => setTimeout(resolve, 25))
      await sql.end({ timeout: 5 })
    },
  }
}
