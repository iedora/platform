import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/shared/db/schema.ts',
  out: './drizzle',
  // Genkan owns its own Postgres instance (genkan-postgres accessory).
  // Tables live in the default `public` schema — no namespace coupling
  // since no other product shares this database.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  casing: 'snake_case',
  // Default migrations table in public; no schema prefix needed.
  migrations: {
    table: '__drizzle_migrations',
  },
})
