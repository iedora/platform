import { afterAll, beforeEach, describe, expect, test } from "bun:test"

import { createDispatcher, enqueue } from "../../src/index.ts"
import { HAS_DB, resetSchema, testDb } from "../helpers/db.ts"

const SCHEMA = "t_dispatcher"
const db = testDb(SCHEMA)
const it = test.skipIf(!HAS_DB)

describe("dispatcher", () => {
  beforeEach(async () => {
    if (HAS_DB) await resetSchema(db, SCHEMA)
  })
  afterAll(async () => {
    if (HAS_DB) await db.destroy()
  })

  it("delivers a message to its topic handler and marks it delivered", async () => {
    const seen: Record<string, unknown>[] = []
    await enqueue(db, { topic: "greet", payload: { hi: "there" } })
    const d = createDispatcher(db, { handlers: { greet: async (m) => void seen.push(m.payload) } })

    const delivered = await d.tick()
    expect(delivered).toBe(1)
    expect(seen).toEqual([{ hi: "there" }])

    const row = await db.selectFrom("outboxMessage").selectAll().executeTakeFirstOrThrow()
    expect(row.deliveredAt).not.toBeNull()
    expect(row.deadAt).toBeNull()
  })

  it("retries with backoff, then dead-letters after maxAttempts", async () => {
    await enqueue(db, { topic: "boom", payload: {} })
    const d = createDispatcher(db, {
      handlers: { boom: async () => { throw new Error("kaboom") } },
      maxAttempts: 3,
      baseMs: 1,
      capMs: 1,
      leaseMs: 0, // immediately re-due so we can drive attempts in a loop
    })

    for (let i = 0; i < 3; i++) {
      await d.tick()
      await new Promise((r) => setTimeout(r, 3))
    }

    const row = await db.selectFrom("outboxMessage").selectAll().executeTakeFirstOrThrow()
    expect(row.attempts).toBe(3)
    expect(row.deadAt).not.toBeNull()
    expect(row.deliveredAt).toBeNull()
    expect(row.lastError).toBe("kaboom")
  })

  it("a message with no handler dead-letters (never silently lost)", async () => {
    await enqueue(db, { topic: "orphan", payload: {} })
    const d = createDispatcher(db, { handlers: {}, maxAttempts: 1, leaseMs: 0 })
    await d.tick()
    const row = await db.selectFrom("outboxMessage").selectAll().executeTakeFirstOrThrow()
    expect(row.deadAt).not.toBeNull()
    expect(row.lastError).toContain("no handler")
  })

  it("FOR UPDATE SKIP LOCKED: concurrent dispatchers never double-deliver", async () => {
    const N = 20
    for (let i = 0; i < N; i++) await enqueue(db, { topic: "work", payload: { i } })

    let calls = 0
    const handler = async () => {
      calls++
      await new Promise((r) => setTimeout(r, 5)) // hold the lease briefly
    }
    const a = createDispatcher(db, { handlers: { work: handler }, batchSize: N })
    const b = createDispatcher(db, { handlers: { work: handler }, batchSize: N })

    const [da, dbn] = await Promise.all([a.tick(), b.tick()])
    expect(calls).toBe(N) // each delivered exactly once
    expect(da + dbn).toBe(N)

    const delivered = await db
      .selectFrom("outboxMessage")
      .select(({ fn }) => fn.count<number>("id").as("n"))
      .where("deliveredAt", "is not", null)
      .executeTakeFirstOrThrow()
    expect(Number(delivered.n)).toBe(N)
  })
})
