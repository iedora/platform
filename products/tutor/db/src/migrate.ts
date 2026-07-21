import { migrate } from "@iedora/db"

// The tutor DB's raw *.sql migrations (applied in filename order by @iedora/db's
// advisory-lock runner). This module owns the directory; tutor-api applies them
// before boot via @iedora/service-kit's `runMigrations`
// (products/tutor/api/src/migrate.ts). Kept runnable directly for local use.
export const MIGRATIONS_DIR = new URL("./migrations_sql", import.meta.url).pathname

if (import.meta.main) {
  // Same DSN the service reads (products/tutor/api/src/config.ts) so `bun --cwd
  // packages/db migrate` and the running service target the SAME database.
  const url =
    process.env.TUTOR_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/tutor_marketplace"
  const applied = await migrate(url, MIGRATIONS_DIR, {
    schema: process.env.DB_SCHEMA || undefined,
    createDatabase: true,
  })
  console.log(applied.length ? `Applied ${applied.length} migration(s).` : "Migrations up to date.")
}
