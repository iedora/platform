import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/shared/db/schema'

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle')

export interface TestDb {
  client: PGlite
  db: ReturnType<typeof drizzle<typeof schema>>
  /** Closes the in-memory client. Call in afterEach/afterAll. */
  cleanup: () => Promise<void>
}

/**
 * Creates an isolated in-memory Postgres for one test. Applies every
 * migration in `./drizzle`, then returns a Drizzle client wired the same
 * way production is (`casing: 'snake_case'`).
 *
 * PGLite is real Postgres semantics — json, indexes, transactions, advisory
 * locks all work. ~1s for the first call (WASM init), <100ms on subsequent
 * migrate calls against the same process.
 *
 * Genkan uses the default `public` schema (see `drizzle.config.ts`); we
 * don't pre-create one here.
 */
export async function makeTestDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema, casing: 'snake_case' })
  await migrate(db, {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsTable: '__drizzle_migrations',
  })
  return {
    client,
    db,
    cleanup: async () => {
      await client.close()
    },
  }
}
