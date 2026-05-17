// Applies Drizzle migrations in production without drizzle-kit at runtime.
// Runs inside the production container via:  node scripts/migrate.mjs
//
// Genkan owns its own Postgres instance (genkan-postgres) — no shared
// schema with menu. Tables live in the default `public` schema.

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

// pg advisory lock garante que dois deploys paralelos não migram em duplicado.
// O valor é arbitrário mas tem de ser estável e único — crc32 de "genkan-migrate".
const LOCK_KEY = 411073872

const sql = postgres(url, { max: 1 })
const db = drizzle(sql)

try {
  console.log(`Acquiring advisory lock (${LOCK_KEY})...`)
  await sql`SELECT pg_advisory_lock(${LOCK_KEY})`

  console.log('Applying migrations from ./drizzle ...')
  // Dedicated database — single migration tracker in the default schema.
  await migrate(db, {
    migrationsFolder: './drizzle',
    migrationsTable: '__drizzle_migrations',
  })
  console.log('Migrations applied successfully.')
} catch (err) {
  console.error('Migration failed:', err)
  process.exitCode = 1
} finally {
  try { await sql`SELECT pg_advisory_unlock(${LOCK_KEY})` } catch {}
  await sql.end()
}
