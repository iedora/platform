import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createJobs, type Jobs } from "./index.ts"

// Runs only where a test Postgres is configured (same gate as the other DB
// suites). createScratchDatabase-style isolation: a throwaway database per file.
const ADMIN_URL = process.env.TEST_DATABASE_URL
const describeDb = ADMIN_URL ? describe : describe.skip

describeDb("createJobs", () => {
  const dbName = `jobs_test_${Date.now().toString(36)}`
  let connectionString: string

  beforeAll(async () => {
    const admin = postgres(ADMIN_URL!, { max: 1 })
    await admin.unsafe(`CREATE DATABASE "${dbName}"`)
    await admin.end()
    const url = new URL(ADMIN_URL!)
    url.pathname = `/${dbName}`
    connectionString = url.toString()
  })

  afterAll(async () => {
    const admin = postgres(ADMIN_URL!, { max: 1 })
    await admin
      .unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName])
      .catch(() => {})
    await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`).catch(() => {})
    await admin.end()
  })

  // A controllable clock so "due"/backoff is deterministic.
  const clock = { t: new Date("2026-01-01T00:00:00Z").getTime() }
  const now = () => new Date(clock.t)
  const advance = (ms: number) => (clock.t += ms)

  let jobs: Jobs
  let ran: Array<{ kind: string; payload: unknown }>

  const build = (handlers: Parameters<typeof createJobs>[0]["handlers"]): Jobs =>
    createJobs({ connectionString, handlers, now, reclaimAfterMs: 60_000, backoff: () => 10_000 })

  beforeEach(async () => {
    clock.t = new Date("2026-01-01T00:00:00Z").getTime()
    ran = []
    // Fresh schema each test.
    const j = createJobs({ connectionString, handlers: {} })
    await j.ensureSchema()
    const sql = postgres(connectionString, { max: 1 })
    await sql`TRUNCATE scheduled_jobs`
    await sql.end()
  })

  it("runs a due job and marks it done", async () => {
    jobs = build({ greet: async ({ payload }) => void ran.push({ kind: "greet", payload }) })
    await jobs.schedule({ kind: "greet", runAt: now(), payload: { name: "ada" } })
    const processed = await jobs.runOnce()
    expect(processed).toBe(1)
    expect(ran).toEqual([{ kind: "greet", payload: { name: "ada" } }])
    await jobs.stop()
  })

  it("does not run a job before it is due", async () => {
    jobs = build({ later: async () => void ran.push({ kind: "later", payload: {} }) })
    await jobs.schedule({ kind: "later", runAt: new Date(clock.t + 60_000) })
    expect(await jobs.runOnce()).toBe(0)
    advance(60_000)
    expect(await jobs.runOnce()).toBe(1)
    expect(ran).toHaveLength(1)
    await jobs.stop()
  })

  it("cancelByKey cancels pending jobs for a key", async () => {
    jobs = build({ x: async () => void ran.push({ kind: "x", payload: {} }) })
    await jobs.schedule({ kind: "x", runAt: now(), key: "order:1" })
    await jobs.schedule({ kind: "x", runAt: now(), key: "order:2" })
    const cancelled = await jobs.cancelByKey("order:1")
    expect(cancelled).toBe(1)
    expect(await jobs.runOnce()).toBe(1) // only order:2 remains
    await jobs.stop()
  })

  it("retries a throwing handler with backoff, then succeeds", async () => {
    let calls = 0
    jobs = build({
      flaky: async () => {
        calls += 1
        if (calls === 1) throw new Error("transient")
      },
    })
    await jobs.schedule({ kind: "flaky", runAt: now(), maxAttempts: 3 })
    await jobs.runOnce() // attempt 1 throws → rescheduled +10s
    expect(calls).toBe(1)
    expect(await jobs.runOnce()).toBe(0) // not due yet
    advance(10_000)
    await jobs.runOnce() // attempt 2 succeeds
    expect(calls).toBe(2)
    await jobs.stop()
  })

  it("lets a handler schedule a follow-up step", async () => {
    jobs = build({
      first: async ({ schedule }) => {
        ran.push({ kind: "first", payload: {} })
        await schedule({ kind: "second", runAt: now(), key: "chain:1" })
      },
      second: async () => void ran.push({ kind: "second", payload: {} }),
    })
    await jobs.schedule({ kind: "first", runAt: now(), key: "chain:1" })
    await jobs.runOnce() // first → schedules second
    await jobs.runOnce() // second
    expect(ran.map((r) => r.kind)).toEqual(["first", "second"])
    await jobs.stop()
  })
})
