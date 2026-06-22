import { type Kysely, sql } from "kysely";

import { type AuditEnvelope, type AuditEvent, type Auditor, buildEnvelope } from "./audit";
import { insertAuditLog } from "./auditlog";
import type { Database } from "./db";

const AUDIT_SUBJECT = "audit.events";
const MAX_ATTEMPTS = 5;

// OutboxWriter records audit events into the producer's own outbox table within
// the caller's transaction (Database.db = active tx or pool). The event is
// durable exactly when the business change commits.
export class OutboxWriter<DB> implements Auditor {
  constructor(
    private readonly database: Database<DB>,
    private readonly source: string,
  ) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.write(event);
    } catch (err) {
      console.error(
        JSON.stringify({ level: "error", msg: "outbox write failed", action: event.action, err: String(err) }),
      );
    }
  }

  recordSync(event: AuditEvent): Promise<void> {
    return this.write(event);
  }

  private async write(event: AuditEvent): Promise<void> {
    const payload = Buffer.from(JSON.stringify(buildEnvelope(event, this.source)));
    await sql`INSERT INTO outbox (subject, payload) VALUES (${AUDIT_SUBJECT}, ${payload})`.execute(
      this.database.db,
    );
  }
}

interface RelayOptions {
  intervalMs?: number;
  batch?: number;
}

interface ClaimedRow {
  id: string;
  payload: Uint8Array;
  attempts: number;
}

// OutboxRelay drains the producer's outbox straight into the audit database and
// marks rows published (Postgres-only). Rows are
// processed independently (a poison row can't fail the batch); a deterministic
// failure dead-letters after MAX_ATTEMPTS, a transient one (audit DB down)
// retries forever without counting an attempt.
export class OutboxRelay<DB> {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly intervalMs: number;
  private readonly batch: number;

  constructor(
    private readonly src: Database<DB>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly audit: Kysely<any>,
    opts: RelayOptions = {},
  ) {
    this.intervalMs = opts.intervalMs ?? 1000;
    this.batch = opts.batch ?? 100;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.running) await new Promise((r) => setTimeout(r, 10)); // let an in-flight tick finish
  }

  /** Drain once now (also used by tests for determinism). Returns rows published. */
  async drainOnce(): Promise<number> {
    let total = 0;
    for (;;) {
      const n = await this.drainBatch();
      total += n;
      if (n < this.batch) break;
    }
    return total;
  }

  private async tick(): Promise<void> {
    if (this.running) return; // no overlapping ticks
    this.running = true;
    try {
      await this.drainOnce();
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: "outbox relay drain failed", err: String(err) }));
    } finally {
      this.running = false;
    }
  }

  private async drainBatch(): Promise<number> {
    return this.src.root.transaction().execute(async (trx) => {
      const claimed = await sql<ClaimedRow>`
        SELECT id, payload, attempts FROM outbox
        WHERE published_at IS NULL AND failed_at IS NULL
        ORDER BY created_at
        LIMIT ${this.batch} FOR UPDATE SKIP LOCKED
      `.execute(trx);
      const rows = claimed.rows;
      if (rows.length === 0) return 0;

      const published: string[] = [];
      for (const row of rows) {
        let env: AuditEnvelope;
        try {
          env = parseEnvelope(row.payload);
        } catch (err) {
          await this.deadLetter(trx, row.id, row.attempts + 1, err);
          continue;
        }
        try {
          await insertAuditLog(this.audit, env);
          published.push(row.id);
        } catch (err) {
          if (isPermanent(err)) {
            if (row.attempts + 1 >= MAX_ATTEMPTS) {
              await this.deadLetter(trx, row.id, row.attempts + 1, err);
            } else {
              await this.bumpAttempt(trx, row.id, row.attempts + 1, err);
            }
          }
          // transient → leave untouched, retried next tick (no attempt counted)
        }
      }

      // Mark delivered rows published. Per-id (batch is small, and it sidesteps
      // array-parameter binding) — all within the claim transaction.
      for (const id of published) {
        await sql`UPDATE outbox SET published_at = now() WHERE id = ${id}`.execute(trx);
      }
      return published.length;
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private bumpAttempt(trx: Kysely<any>, id: string, attempts: number, cause: unknown): Promise<unknown> {
    return sql`UPDATE outbox SET attempts = ${attempts}, last_error = ${String(cause)} WHERE id = ${id}`.execute(
      trx,
    );
  }

  private deadLetter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trx: Kysely<any>,
    id: string,
    attempts: number,
    cause: unknown,
  ): Promise<unknown> {
    console.warn(
      JSON.stringify({ level: "warn", msg: "outbox row dead-lettered", id, attempts, err: String(cause) }),
    );
    return sql`UPDATE outbox SET attempts = ${attempts}, last_error = ${String(cause)}, failed_at = now() WHERE id = ${id}`.execute(
      trx,
    );
  }
}

function parseEnvelope(payload: Uint8Array): AuditEnvelope {
  const env = JSON.parse(Buffer.from(payload).toString("utf8")) as AuditEnvelope;
  env.occurredAt = new Date(env.occurredAt); // revive Date from its ISO string
  return env;
}

// A deterministic data/integrity error recurs on every retry (dead-letter it);
// a connection/resource/operator error is transient (retry, don't count it).
// Bun's PostgresError carries the SQLSTATE in `errno`.
function isPermanent(err: unknown): boolean {
  const sqlState = (err as { errno?: unknown })?.errno;
  if (typeof sqlState === "string") {
    const cls = sqlState.slice(0, 2);
    return !(cls === "08" || cls === "53" || cls === "57" || cls === "58");
  }
  return false;
}
