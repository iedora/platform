import { afterAll, beforeEach, describe, expect, test } from "bun:test"

import { createInbox } from "../../src/index.ts"
import { HAS_DB, resetSchema, testDb } from "../helpers/db.ts"

const SCHEMA = "t_inbox"
const db = testDb(SCHEMA)
const inbox = createInbox(db)
const it = test.skipIf(!HAS_DB)

describe("inbox", () => {
  beforeEach(async () => {
    if (HAS_DB) await resetSchema(db, SCHEMA)
  })
  afterAll(async () => {
    if (HAS_DB) await db.destroy()
  })

  it("runs a handler once and treats a duplicate id as a no-op", async () => {
    let ran = 0
    const first = await inbox.handleOnce({ messageId: "evt-1", topic: "x" }, async () => void ran++)
    const second = await inbox.handleOnce({ messageId: "evt-1", topic: "x" }, async () => void ran++)
    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(ran).toBe(1)
  })

  it("processes concurrent duplicates exactly once", async () => {
    let ran = 0
    const handler = async () => {
      await new Promise((r) => setTimeout(r, 5))
      ran++
    }
    const results = await Promise.all(
      Array.from({ length: 8 }, () => inbox.handleOnce({ messageId: "dup", topic: "x" }, handler)),
    )
    expect(results.filter(Boolean).length).toBe(1)
    expect(ran).toBe(1)
  })

  it("rolls back the dedup record if the handler throws (so it can retry)", async () => {
    await expect(
      inbox.handleOnce({ messageId: "evt-2", topic: "x" }, async () => {
        throw new Error("handler failed")
      }),
    ).rejects.toThrow("handler failed")
    // The failed attempt must not leave a dedup mark behind.
    let ran = 0
    const retry = await inbox.handleOnce({ messageId: "evt-2", topic: "x" }, async () => void ran++)
    expect(retry).toBe(true)
    expect(ran).toBe(1)
  })

  it("prune removes records older than the cutoff", async () => {
    await inbox.handleOnce({ messageId: "old", topic: "x" }, async () => {})
    await inbox.prune(new Date(Date.now() + 60_000)) // cutoff in the future -> removes it
    const left = await db
      .selectFrom("inboxMessage")
      .select(({ fn }) => fn.count<number>("messageId").as("n"))
      .executeTakeFirstOrThrow()
    expect(Number(left.n)).toBe(0)
  })
})
