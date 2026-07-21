import { CamelCasePlugin, Kysely, type KyselyConfig, type KyselyPlugin } from "kysely"
import { PostgresJSDialect } from "kysely-postgres-js"

import { makeSql } from "./driver.ts"
import { withSearchPath } from "./search-path.ts"

export type CreateDbOptions = {
  /** Isolate this connection to a Postgres schema (search_path) in a shared
   *  database. Queries stay unqualified and land in the schema; omit to use the
   *  database's default (public / its own DB). Splittable: drop it to move the
   *  service onto its own database with no code change. */
  schema?: string
  /** Max pool connections (default 10). Keep modest: on a shared box every idle
   *  backend costs Postgres RAM, and pools must stay under max_connections. */
  poolMax?: number
  /** Close idle connections after N seconds (default 30). */
  idleTimeout?: number
  /** Cap connection age in seconds (default 600), recycling the pool. */
  maxLifetime?: number
  /** CamelCasePlugin: snake_case in the DB, camelCase in TS. Default true. Turn
   *  off when your generated types are already snake_case. */
  camelCase?: boolean
  /** Extra Kysely plugins, appended after CamelCasePlugin. */
  plugins?: KyselyPlugin[]
  /** Kysely log hook — e.g. an OTel per-query span recorder. */
  log?: KyselyConfig["log"]
}

/** Bun's native `SQL` driver behind the kysely-postgres-js dialect, tuned for the
 *  shared box. */
export function dialect(url: string, opts: CreateDbOptions = {}): PostgresJSDialect {
  return new PostgresJSDialect({
    postgres: makeSql(withSearchPath(url, opts.schema), {
      poolMax: opts.poolMax,
      idleTimeout: opts.idleTimeout,
      maxLifetime: opts.maxLifetime,
    }),
  })
}

/**
 * A `Kysely<DB>` over Postgres on Bun's `SQL` driver — the one-liner every
 * service would otherwise hand-roll.
 *
 * ```ts
 * export const db = createDb<DB>(process.env.DATABASE_URL!)
 * ```
 */
export function createDb<DB>(url: string, opts: CreateDbOptions = {}): Kysely<DB> {
  const plugins = [
    ...(opts.camelCase === false ? [] : [new CamelCasePlugin()]),
    ...(opts.plugins ?? []),
  ]
  return new Kysely<DB>({ dialect: dialect(url, opts), plugins, log: opts.log })
}
