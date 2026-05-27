import path from 'node:path'
import { makeTestDb as makeTestDbGeneric, type TestDb as GenericTestDb } from '@iedora/db/testing'
import * as schema from '../db/schema'

/**
 * One isolated in-memory Postgres for each test (or suite). Binds the
 * generic PGLite fixture from `@iedora/db/testing` to menu's schema +
 * migrations folder. See `@iedora/db/testing` for the lifecycle
 * contract.
 *
 * Menu owns one Postgres schema (`menu.*`); the migration runner
 * creates it but PGLite occasionally lags real Postgres on
 * `CREATE SCHEMA` inside the migrator's transaction wrapping, so the
 * generic fixture pre-creates it when `pgSchema` is set.
 */
export type TestDb = GenericTestDb<typeof schema>

export function makeTestDb(): Promise<TestDb> {
  return makeTestDbGeneric(schema, {
    migrationsFolder: path.join(process.cwd(), 'drizzle'),
    migrationsTable: '__drizzle_migrations',
    pgSchema: 'menu',
  })
}
