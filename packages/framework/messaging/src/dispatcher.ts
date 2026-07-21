import { type Kysely, sql } from "kysely"

import { backoffMs } from "./backoff"

/** A delivered message as seen by a handler. */
export type DeliveredMessage = {
  id: string
  topic: string
  payload: Record<string, unknown>
  attempts: number
}

/** Deliver a message. Throw to trigger a retry (or dead-letter once exhausted). */
export type Handler = (msg: DeliveredMessage) => Promise<void>

export type DispatcherOptions = {
  /** topic → handler. A message with no handler dead-letters after retries. */
  handlers: Record<string, Handler>
  /** Rows claimed per tick. Keep 50–200: larger = longer locks. Default 100. */
  batchSize?: number
  /** Attempts before dead-lettering. Default 6. */
  maxAttempts?: number
  /** First-retry delay (ms). Default 5s. */
  baseMs?: number
  /** Max retry delay (ms). Default 1h. */
  capMs?: number
  /** How long a claimed message is hidden from other workers (ms). Default 60s. */
  leaseMs?: number
  /** Poll interval for the background loop (ms). Default 2s. */
  pollMs?: number
}

type Claimed = { id: string; topic: string; payload: Record<string, unknown>; attempts: number }

/**
 * A transactional-outbox dispatcher. On each tick it claims a batch of due
 * messages with `FOR UPDATE SKIP LOCKED` — so many instances scale horizontally
 * without double-claiming — leases them forward, then runs each topic's handler.
 * Success marks delivered; failure increments attempts with jittered exponential
 * backoff, and dead-letters once `maxAttempts` is reached. At-least-once, so
 * handlers must be idempotent (see the inbox).
 *
 * Plugin-agnostic: raw `sql` against the snake_case tables, so it works with any
 * Kysely regardless of CamelCasePlugin.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDispatcher(db: Kysely<any>, opts: DispatcherOptions) {
  const batchSize = opts.batchSize ?? 100
  const maxAttempts = opts.maxAttempts ?? 6
  const backoff = { baseMs: opts.baseMs ?? 5_000, capMs: opts.capMs ?? 3_600_000 }
  const leaseMs = opts.leaseMs ?? 60_000

  /** Claim + lease a batch atomically so concurrent workers skip these rows. All
   *  time comparisons use the DB clock (`now()`), never the app's. */
  async function claim(): Promise<Claimed[]> {
    return db.transaction().execute(async (trx) => {
      const res = await sql<Omit<Claimed, "payload"> & { payload: unknown }>`
        SELECT id, topic, payload, attempts FROM outbox_message
        WHERE delivered_at IS NULL AND dead_at IS NULL AND next_attempt_at <= now()
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `.execute(trx)
      // Raw `sql` bypasses the dialect's jsonb→object result parsing (that only
      // applies to the query-builder path), so a jsonb payload can come back as
      // its text form — normalize to an object either way.
      const rows: Claimed[] = res.rows.map((r) => ({
        id: r.id,
        topic: r.topic,
        attempts: r.attempts,
        payload: (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) as Record<
          string,
          unknown
        >,
      }))
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id)
        // sql.join binds each id as a scalar param ($1,$2,…) — avoids passing a
        // JS array as a single uuid[] param, which Bun's SQL driver serializes
        // as a postgres array literal that fails to parse.
        await sql`
          UPDATE outbox_message
          SET next_attempt_at = now() + make_interval(secs => ${leaseMs / 1000})
          WHERE id IN (${sql.join(ids)})
        `.execute(trx)
      }
      return rows
    })
  }

  async function deliver(msg: Claimed): Promise<boolean> {
    const handler = opts.handlers[msg.topic]
    try {
      if (!handler) throw new Error(`no handler for topic "${msg.topic}"`)
      await handler({ id: msg.id, topic: msg.topic, payload: msg.payload, attempts: msg.attempts })
      await sql`
        UPDATE outbox_message SET delivered_at = now(), last_error = NULL WHERE id = ${msg.id}
      `.execute(db)
      return true
    } catch (e) {
      const attempts = msg.attempts + 1
      const dead = attempts >= maxAttempts
      const err = e instanceof Error ? e.message : String(e)
      if (dead) {
        await sql`
          UPDATE outbox_message SET attempts = ${attempts}, last_error = ${err}, dead_at = now()
          WHERE id = ${msg.id}
        `.execute(db)
      } else {
        const next = new Date(Date.now() + backoffMs(attempts, backoff))
        await sql`
          UPDATE outbox_message
          SET attempts = ${attempts}, last_error = ${err}, next_attempt_at = ${next}
          WHERE id = ${msg.id}
        `.execute(db)
      }
      return false
    }
  }

  /** Process one batch. Returns how many were delivered. */
  async function tick(): Promise<number> {
    const rows = await claim()
    let delivered = 0
    for (const row of rows) if (await deliver(row)) delivered++
    return delivered
  }

  let timer: ReturnType<typeof setInterval> | null = null
  let running = false

  return {
    tick,
    /** Start the background loop (non-overlapping). */
    start(): void {
      if (timer) return
      timer = setInterval(async () => {
        if (running) return
        running = true
        try {
          await tick()
        } catch (e) {
          console.error("[messaging] dispatcher tick failed:", e)
        } finally {
          running = false
        }
      }, opts.pollMs ?? 2_000)
    },
    stop(): void {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

export type Dispatcher = ReturnType<typeof createDispatcher>
