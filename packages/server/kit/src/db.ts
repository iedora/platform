import { AsyncLocalStorage } from "node:async_hooks";

import { SpanKind, SpanStatusCode, trace, tracer } from "@iedora/observability";
import { SQL } from "bun";
import { Kysely, type LogEvent, sql, type Transaction } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";

// Emits a CLIENT span per query from Kysely's log event (fires on success AND
// error, with the duration), giving the `… → business → db` leaves of a request
// trace. ONLY when there's an active parent span: background work (the outbox
// relay polling every 1s, migrations) runs with no parent, and tracing those
// would flood the backend with rootless db spans carrying no business context.
// The span is created after the query, so its start is backdated by the measured
// duration. db.query.text is the PARAMETERIZED sql ($1, $2) — no bound values,
// no PII.
function recordQuerySpan(event: LogEvent): void {
  if (!trace.getActiveSpan()?.isRecording()) return;
  const text = event.query.sql;
  const op = text.trimStart().split(/\s/, 1)[0]?.toUpperCase();
  const table = text.match(/\b(?:from|into|update|join)\s+"?([a-z_][a-z0-9_]*)"?/i)?.[1];
  const span = tracer.startSpan(table ? `db ${op} ${table}` : `db ${op ?? "query"}`, {
    kind: SpanKind.CLIENT,
    startTime: Date.now() - event.queryDurationMillis,
  });
  span.setAttribute("db.system", "postgresql");
  if (op) span.setAttribute("db.operation.name", op);
  if (table) span.setAttribute("db.collection.name", table);
  span.setAttribute("db.query.text", text.length > 1000 ? `${text.slice(0, 1000)}…` : text);
  if (event.level === "error") {
    span.recordException(event.error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(event.error) });
  }
  span.end();
}

// Transaction-in-context: the active transaction is carried implicitly so
// repositories transparently join the caller's unit of work and nested runInTx
// reuses it. Stored as Kysely<any> because Kysely is invariant in its DB param
// — each Database casts back to its own DB type on read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const txCtx = new AsyncLocalStorage<Kysely<any>>();

/**
 * Database wraps a Kysely instance bound to one logical database, on Bun's
 * native `SQL` driver via the kysely-postgres-js dialect.
 *
 * `db` returns the active transaction inside runInTx, otherwise the root pool
 * (pgtx.Or). `runInTx` runs fn in a transaction; a nested call reuses the
 * in-flight tx so the whole unit of work commits atomically (pgtx.RunInTx).
 */
export class Database<DB> {
  readonly root: Kysely<DB>;

  // Bun SQL defaults to max:10, but (a) historically didn't always enforce it
  // and could leak connections (oven-sh/bun#23215), and (b) on the single small
  // VM several service pools must stay well under Postgres's max_connections.
  // So we pin a modest pool and recycle: idleTimeout closes idle connections,
  // maxLifetime caps connection age — both bound the live-connection count.
  constructor(url: string, opts: { poolMax?: number } = {}) {
    this.root = new Kysely<DB>({
      log: recordQuerySpan, // one CLIENT span per query (no-op when OTel is off)
      dialect: new PostgresJSDialect({
        postgres: new SQL(url, {
          // Modest pool: short-lived OLTP queries don't need a deep pool, and on
          // the shared single box every idle backend costs Postgres RAM. Several
          // service pools must stay well under Postgres max_connections.
          max: opts.poolMax ?? 5,
          idleTimeout: 30, // seconds
          maxLifetime: 600, // seconds
        }),
      }),
    });
  }

  get db(): Kysely<DB> {
    return (txCtx.getStore() as Kysely<DB> | undefined) ?? this.root;
  }

  runInTx<T>(fn: (tx: Kysely<DB>) => Promise<T>): Promise<T> {
    const existing = txCtx.getStore() as Kysely<DB> | undefined;
    if (existing) return fn(existing); // nested → reuse the in-flight tx
    return this.root.transaction().execute((trx: Transaction<DB>) =>
      txCtx.run(trx, () => fn(trx)),
    );
  }

  /** Liveness probe for /up — mirrors db.Pools.Ping. */
  async ping(): Promise<void> {
    await sql`select 1`.execute(this.root);
  }

  close(): Promise<void> {
    return this.root.destroy();
  }
}
