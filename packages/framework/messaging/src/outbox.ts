import { type Kysely, sql } from "kysely"

/** A message to enqueue: a topic + an arbitrary JSON payload. */
export type EnqueueInput = { topic: string; payload?: Record<string, unknown> }

/**
 * Enqueue a message onto the outbox. Pass the transaction that also performs the
 * state change, so the message is committed atomically with it (the whole point
 * of the pattern — no lost or phantom events).
 *
 * Plugin-agnostic: written as raw `sql` against the snake_case tables, so it
 * works with ANY Kysely regardless of whether the consumer uses CamelCasePlugin.
 * The payload is passed as a RAW OBJECT — kysely-postgres-js/Bun SQL serializes
 * it to jsonb. Do NOT pre-`JSON.stringify` it: that double-encodes into a jsonb
 * *string* scalar (so `payload->>'key'` returns null downstream).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enqueue(exec: Kysely<any>, input: EnqueueInput): Promise<void> {
  await sql`
    INSERT INTO outbox_message (topic, payload)
    VALUES (${input.topic}, ${sql.val(input.payload ?? {})})
  `.execute(exec)
}
