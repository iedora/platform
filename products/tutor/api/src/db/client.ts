import { createDb } from "@iedora/db"

import type { DB } from "./types.ts"

// The shared database, via @iedora/db (postgres.js under Node/Next.js, Bun SQL
// under bun). Used by the seed script; the running service builds its own
// Database. Reads the SAME env the service does (products/tutor/api/src/config.ts):
// TUTOR_DATABASE_URL + DB_SCHEMA (empty = default/public search_path), so seed
// and service touch the same database + schema. CamelCasePlugin is on by default,
// so app code uses camelCase while columns stay snake_case.
const url =
  process.env.TUTOR_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/tutor_marketplace"

export const db = createDb<DB>(url, { schema: process.env.DB_SCHEMA || undefined })

export type Database = typeof db
