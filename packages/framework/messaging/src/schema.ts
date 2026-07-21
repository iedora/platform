import { type ColumnType, type Generated, type Kysely, type Selectable, sql } from "kysely"

type Created = ColumnType<Date, Date | string | undefined, never>
type Timestamp = ColumnType<Date, Date | string, Date | string>
// jsonb as a plain object on read AND write — pass the object, never a
// pre-stringified string (that double-encodes under kysely-postgres-js/Bun SQL).
type Jsonb<T> = ColumnType<T, T, T>

/** A queued message awaiting at-least-once delivery. Written in the same
 *  transaction as the state change it describes; a dispatcher delivers it. */
export interface OutboxMessageTable {
  id: Generated<string>
  /** Routes the message to a handler, e.g. "email", "audit". */
  topic: string
  payload: Jsonb<Record<string, unknown>>
  /** Delivery attempts so far (incremented only on handler failure). */
  attempts: Generated<number>
  /** Not eligible for delivery until this time (lease + backoff live here).
   *  DB-defaulted to now(), so optional on insert. */
  nextAttemptAt: ColumnType<Date, Date | string | undefined, Date | string>
  deliveredAt: Timestamp | null
  /** Set when attempts are exhausted — the dead-letter marker. */
  deadAt: Timestamp | null
  lastError: string | null
  createdAt: Created
}

/** Processed-message ledger for the idempotent inbox (dedup by id). */
export interface InboxMessageTable {
  messageId: string
  topic: string
  processedAt: Created
}

/** Merge into your Kysely `DB` so `enqueue`/`dispatcher`/`inbox` type-check
 *  against your database instance. */
export interface MessagingDB {
  outboxMessage: OutboxMessageTable
  inboxMessage: InboxMessageTable
}

export type OutboxMessage = Selectable<OutboxMessageTable>
export type InboxMessage = Selectable<InboxMessageTable>

/** Create the messaging tables. Call from a migration (Postgres). Assumes the
 *  consuming Kysely uses CamelCasePlugin (columns are snake_case in the DB). */
export async function up(db: Kysely<unknown>): Promise<void> {
  const now = sql`now()`
  await db.schema
    .createTable("outbox_message")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("topic", "text", (c) => c.notNull())
    .addColumn("payload", "jsonb", (c) => c.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("attempts", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("next_attempt_at", "timestamptz", (c) => c.notNull().defaultTo(now))
    .addColumn("delivered_at", "timestamptz")
    .addColumn("dead_at", "timestamptz")
    .addColumn("last_error", "text")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(now))
    .execute()
  // The dispatcher scans the due, undelivered, un-dead tail — keep it tight.
  await sql`CREATE INDEX outbox_message_due_idx ON outbox_message (next_attempt_at)
            WHERE delivered_at IS NULL AND dead_at IS NULL`.execute(db)

  await db.schema
    .createTable("inbox_message")
    .addColumn("message_id", "text", (c) => c.primaryKey())
    .addColumn("topic", "text", (c) => c.notNull())
    .addColumn("processed_at", "timestamptz", (c) => c.notNull().defaultTo(now))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("inbox_message").ifExists().execute()
  await db.schema.dropTable("outbox_message").ifExists().execute()
}
