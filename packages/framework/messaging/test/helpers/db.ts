import { SQL } from "bun"
import { CamelCasePlugin, Kysely, sql } from "kysely"
import { PostgresJSDialect } from "kysely-postgres-js"

import { type MessagingDB, up } from "../../src/index.ts"

export const HAS_DB = Boolean(process.env.DATABASE_URL)

/** A Kysely on Bun's SQL driver (same as production), bound to a dedicated
 *  schema via search_path so test files run in parallel without clobbering. */
export function testDb(schema: string): Kysely<MessagingDB> {
  const url = `${process.env.DATABASE_URL}?options=-c%20search_path%3D${schema}`
  return new Kysely<MessagingDB>({
    dialect: new PostgresJSDialect({ postgres: new SQL(url, { max: 4 }) }),
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
