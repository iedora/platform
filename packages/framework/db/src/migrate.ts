import { makeSql } from "./driver"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { withSearchPath } from "./search-path"

// Canonical Postgres migration runner. Applies raw `*.sql` files in filename
// order, once each, recorded in `schema_migrations`, serialized across
// concurrent deploys by a Postgres ADVISORY LOCK — the industry-standard
// approach (Rails, Flyway, node-pg-migrate, graphile-migrate all do this).
//
// Design decisions, and why:
//   - SESSION-level `pg_advisory_lock` held on ONE reserved connection for the
//     whole run (not `pg_advisory_xact_lock`). A transaction-level lock would
//     force the entire run into a single transaction, which makes
//     `CREATE INDEX CONCURRENTLY` (and any non-transactional DDL) impossible.
//     A session lock is decoupled from transactions, so each file gets its own.
//     Leak-safe: lock + unlock run on the SAME reserved connection (Bun's
//     sql.reserve()), and Postgres auto-releases session locks if the
//     connection dies — no orphaned-lock footgun.
//   - ONE TRANSACTION PER MIGRATION by default: the DDL and its bookkeeping row
//     commit together, so a crash never leaves a file half-recorded. A file may
//     opt out with a `-- no-transaction` header (first lines) for
//     `CREATE INDEX CONCURRENTLY` etc. — such files must be individually
//     idempotent (use `IF NOT EXISTS`), since a failure leaves partial state.
//   - RAW SQL FILES, not programmatic up/down: Bun's `sql.unsafe(text)` runs a
//     whole multi-statement file — dollar-quoted function/trigger bodies
//     included — in one call (no fragile `;`-splitting), and there's no build
//     step or import graph. Roll-forward only; a paired `*.down.sql` is ignored
//     here (dev tooling can use it).

// Fixed, namespaced 2-int key so the migration lock never collides with an
// application advisory lock (classid reserved for this runner, objid = migrations).
const LOCK_CLASSID = 0x1d10
const LOCK_OBJID = 0x4a11

// Per-schema advisory-lock objid so two services migrating DIFFERENT schemas of
// the same shared database don't block each other, while two deploys of the SAME
// schema still serialize. A stable 32-bit hash of the schema name.
function lockObjid(schema: string | undefined): number {
  if (!schema) return LOCK_OBJID
  let h = 0
  for (let i = 0; i < schema.length; i++) h = (Math.imul(h, 31) + schema.charCodeAt(i)) | 0
  return h
}

export interface MigrateOptions {
  /** Apply into a Postgres schema (search_path) in a shared database — created
   *  if missing. `schema_migrations` and every table land in it, so the service
   *  is isolated as if it had its own DB and can be split onto one later with no
   *  code change. Omit for the default (public / a dedicated DB). */
  schema?: string
  /** CREATE the target database first if missing (connects to `postgres`). */
  createDatabase?: boolean
  /** Log each applied file (default true). */
  log?: boolean
  /** Retry the whole run on a transient connection error (DB restart / dropped
   *  socket). Default 0. Safe: applied files are recorded, so a retry resumes. */
  retries?: number
  /** Delay between retries (ms). Default 1000. */
  retryDelayMs?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Connection-level errors worth retrying — the DB went away mid-run, not a bad
 *  migration. A failed migration throws its own error and is NOT retried. */
function isTransient(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return /connection terminated|econnreset|econnrefused|shutting down|terminating connection|server closed the connection/i.test(
    m,
  )
}

function adminUrl(url: string): string {
  const u = new URL(url)
  u.pathname = "/postgres"
  return u.toString()
}

/** CREATE the target database if it doesn't exist. Runs against `postgres`,
 *  outside any transaction (CREATE DATABASE can't run in one). */
export async function ensureDatabase(url: string): Promise<void> {
  const name = new URL(url).pathname.replace(/^\//, "")
  if (!name) throw new Error("ensureDatabase: no database name in url")
  const admin = makeSql(adminUrl(url), { poolMax: 2 })
  try {
    const rows = (await admin`SELECT 1 FROM pg_database WHERE datname = ${name}`) as unknown[]
    if (rows.length === 0) await admin.unsafe(`CREATE DATABASE "${name}"`)
  } finally {
    await admin.end()
  }
}

/**
 * Apply pending migrations from `dir` and return the filenames applied.
 *
 * ```ts
 * await migrate(process.env.DATABASE_URL!, new URL("./migrations", import.meta.url).pathname, {
 *   createDatabase: true,
 *   retries: 5,
 * })
 * ```
 *
 * Files are `*.sql`, applied in lexical filename order — use zero-padded or
 * ISO-timestamp prefixes (`0001_init.sql`, `20260716T1200_add_index.sql`) so the
 * order is stable. Already-applied files are skipped. A file may start with a
 * `-- no-transaction` header to run outside a transaction.
 */
export async function migrate(
  url: string,
  dir: string,
  opts: MigrateOptions = {},
): Promise<string[]> {
  const retries = opts.retries ?? 0
  for (let attempt = 0; ; attempt++) {
    try {
      return await runOnce(url, dir, opts)
    } catch (err) {
      if (attempt < retries && isTransient(err)) {
        if (opts.log !== false) {
          console.warn(`↻ migration connection lost, retrying (${attempt + 1}/${retries})`)
        }
        await sleep(opts.retryDelayMs ?? 1000)
        continue
      }
      throw err
    }
  }
}

async function runOnce(url: string, dir: string, opts: MigrateOptions): Promise<string[]> {
  if (opts.createDatabase) await ensureDatabase(url)

  const objid = lockObjid(opts.schema)
  // search_path pins every connection (incl. the reserved one) to the schema, so
  // schema_migrations + all tables land there.
  const pool = makeSql(withSearchPath(url, opts.schema), { poolMax: 4 })
  // One reserved connection holds the session lock for the entire run.
  const conn = await pool.reserve()
  const applied: string[] = []
  try {
    // Create the schema before the lock/search_path matter — CREATE SCHEMA works
    // regardless of search_path, and everything after lands inside it.
    if (opts.schema) await conn.unsafe(`CREATE SCHEMA IF NOT EXISTS "${opts.schema}"`)
    await conn`SELECT pg_advisory_lock(${LOCK_CLASSID}, ${objid})`
    await conn.unsafe(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name       text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    const doneRows = (await conn`SELECT name FROM schema_migrations`) as { name: string }[]
    const done = new Set(doneRows.map((r) => r.name))

    const files = (await readdir(dir))
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
      .sort()

    for (const name of files) {
      if (done.has(name)) continue
      const body = await readFile(join(dir, name), "utf8")
      const noTx = /^\s*--\s*no-transaction\b/m.test(body)

      if (noTx) {
        // Non-transactional (e.g. CREATE INDEX CONCURRENTLY). Not atomic — the
        // file must be individually idempotent.
        await conn.unsafe(body)
        await conn`INSERT INTO schema_migrations (name) VALUES (${name})`
      } else {
        await conn.unsafe("BEGIN")
        try {
          await conn.unsafe(body) // whole multi-statement file, dollar-quotes OK
          await conn`INSERT INTO schema_migrations (name) VALUES (${name})`
          await conn.unsafe("COMMIT")
        } catch (e) {
          await conn.unsafe("ROLLBACK").catch(() => {})
          throw new Error(`migration ${name} failed: ${e instanceof Error ? e.message : String(e)}`, {
            cause: e,
          })
        }
      }
      if (opts.log !== false) console.log(`✓ ${name}`)
      applied.push(name)
    }
    return applied
  } finally {
    await conn`SELECT pg_advisory_unlock(${LOCK_CLASSID}, ${objid})`.catch(() => {})
    conn.release()
    await pool.end()
  }
}
