import { CamelCasePlugin, Kysely, sql } from "kysely"
import { PostgresJSDialect } from "kysely-postgres-js"
import postgres from "postgres"

import { type MessagingDB, up } from "../../src/index.ts"

export const HAS_DB = Boolean(process.env.DATABASE_URL)

/** A Kysely on the postgres.js driver (same as production), bound to a dedicated
 *  schema via search_path so test files run in parallel without clobbering.
 *  When DATABASE_URL is unset the client is constructed against a placeholder
 *  URL and never queried (the integration tests skip via HAS_DB); postgres.js
 *  parses the URL eagerly, so it must be well-formed. */
export function testDb(schema: string): Kysely<MessagingDB> {
  const base = process.env.DATABASE_URL ?? "postgres://localhost:5432/postgres"
  const url = `${base}?options=-c%20search_path%3D${schema}`
  return new Kysely<MessagingDB>({
    dialect: new PostgresJSDialect({ postgres: postgres(url, { max: 4 }) }),
    plugins: [new CamelCasePlugin()],
  })
}

/** Drop + recreate the schema, then create the messaging tables in it. */
export async function resetSchema(db: Kysely<MessagingDB>, schema: string): Promise<void> {
  const k = db as unknown as Kysely<unknown>
  await sql`drop schema if exists ${sql.id(schema)} cascade`.execute(k)
  await sql`create schema ${sql.id(schema)}`.execute(k)
  await up(k)
}
