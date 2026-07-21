import { type Kysely, sql } from "kysely"

/**
 * Idempotent inbox. Because outbox delivery is at-least-once, a consumer may see
 * the same message twice; the inbox deduplicates by id. `handleOnce` records the
 * id and runs the handler in ONE transaction, so processing and the dedup mark
 * commit together — a duplicate is a no-op that returns false.
 *
 * Plugin-agnostic: raw `sql` against snake_case tables, so it works with any
 * Kysely regardless of CamelCasePlugin.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createInbox(db: Kysely<any>) {
  return {
    /**
     * Run `handler` exactly once for `messageId`. Returns true if it ran, false
     * if already processed. The handler gets the same transaction so its writes
     * are atomic with the dedup record.
     */
    async handleOnce(
      input: { messageId: string; topic: string },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: (trx: Kysely<any>) => Promise<void>,
    ): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        // RETURNING is driver-agnostic: a row comes back only when the insert
        // actually happened (affected-row counts vary by driver).
        const res = await sql<{ message_id: string }>`
          INSERT INTO inbox_message (message_id, topic)
          VALUES (${input.messageId}, ${input.topic})
          ON CONFLICT (message_id) DO NOTHING
          RETURNING message_id
        `.execute(trx)
        if (res.rows.length === 0) return false // conflict → already processed
        await handler(trx)
        return true
      })
    },

    /** Prune processed-message records older than `olderThan`. */
    async prune(olderThan: Date): Promise<void> {
      await sql`DELETE FROM inbox_message WHERE processed_at < ${olderThan}`.execute(db)
    },
  }
}

export type Inbox = ReturnType<typeof createInbox>
