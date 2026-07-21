import { AsyncLocalStorage } from "node:async_hooks"

import { type Kysely, sql, type Transaction } from "kysely"

import { createDb, type CreateDbOptions } from "./client.ts"

// Transaction-in-context: the active transaction is carried implicitly so
// repositories transparently join the caller's unit of work, and nested runInTx
// reuses it. The store is `unknown`, not `Kysely<any>`: Kysely is invariant in
// its DB param, so no single `Kysely<X>` accepts every DB's transaction — but
// `unknown` accepts any value on store, and each Database casts it back to its
// own `Kysely<DB>` on read (the DB type is known there). No `any`, no disable.
const txCtx = new AsyncLocalStorage<unknown>()

/**
 * `Database<DB>` binds a Kysely to one logical database and carries the active
 * transaction implicitly.
 *
 * - `db` returns the in-flight transaction inside `runInTx`, else the root pool.
 * - `runInTx(fn)` runs `fn` in a transaction; a nested call reuses the in-flight
 *   one, so the whole unit of work commits atomically. Repositories read `.db`
 *   and never thread a `tx` argument.
 */
export class Database<DB> {
  readonly root: Kysely<DB>

  constructor(url: string, opts: CreateDbOptions = {}) {
    this.root = createDb<DB>(url, opts)
  }

  /** The active transaction inside `runInTx`, otherwise the root pool. */
  get db(): Kysely<DB> {
    return (txCtx.getStore() as Kysely<DB> | undefined) ?? this.root
  }

  runInTx<T>(fn: (tx: Kysely<DB>) => Promise<T>): Promise<T> {
    const existing = txCtx.getStore() as Kysely<DB> | undefined
    if (existing) return fn(existing) // nested → reuse the in-flight tx
    return this.root.transaction().execute((trx: Transaction<DB>) => txCtx.run(trx, () => fn(trx)))
  }

  /** Liveness probe for /up. */
  async ping(): Promise<void> {
    await sql`select 1`.execute(this.root)
  }

  close(): Promise<void> {
    return this.root.destroy()
  }
}
