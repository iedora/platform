import { Database as BaseDatabase } from "@iedora/db";

import { recordQuerySpan } from "./otel.ts"; // one CLIENT span per query (no-op when OTel is off)

// A service's tx-in-context Database (from @iedora/db), with a modest pool for
// the shared box, an optional `schema` so services can share ONE database while
// staying isolated (search_path) — splittable onto their own DB later with no
// code change — and a query-span log hook for tracing. `camelCase` follows
// @iedora/db's default (true = CamelCasePlugin on, snake_case DB / camelCase TS);
// pass `false` for a service whose types are snake_case-native.
export class Database<DB> extends BaseDatabase<DB> {
  constructor(url: string, opts: { poolMax?: number; schema?: string; camelCase?: boolean } = {}) {
    super(url, {
      schema: opts.schema,
      poolMax: opts.poolMax ?? 5,
      idleTimeout: 30,
      maxLifetime: 600,
      camelCase: opts.camelCase, // undefined → @iedora/db default (true)
      log: recordQuerySpan,
    });
  }
}
