import { Database as BaseDatabase } from "@iedora/db";

import { recordQuerySpan } from "./otel"; // one CLIENT span per query (no-op when OTel is off)

// Menu's Database is now @iedora/db's tx-in-context Database, specialized for
// menu: snake_case-native types (no CamelCasePlugin), a modest pool for the
// shared box, an optional `schema` so many services share ONE database while
// staying isolated (search_path) — splittable onto their own DB later with no
// code change — and a query-span log hook for tracing.
export class Database<DB> extends BaseDatabase<DB> {
  constructor(url: string, opts: { poolMax?: number; schema?: string } = {}) {
    super(url, {
      schema: opts.schema,
      poolMax: opts.poolMax ?? 5,
      idleTimeout: 30,
      maxLifetime: 600,
      camelCase: false, // menu's generated types are snake_case
      log: recordQuerySpan,
    });
  }
}
