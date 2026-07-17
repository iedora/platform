// Menu services' migration entrypoint, now backed by @iedora/db's advisory-lock
// runner (raw *.sql files, session-level pg_advisory_lock on a reserved
// connection, one transaction per file). Same shape services already call.
//
// PROD NOTE: @iedora/db records applied files in schema_migrations(name); menu's
// previous in-house runner used schema_migrations(version). An EXISTING database
// needs a one-time `ALTER TABLE schema_migrations RENAME COLUMN version TO name`
// before the first run on this version. Fresh databases are unaffected.
import { ensureDatabase, migrate } from "@iedora/db"

export interface MigrateOptions {
  /** DSN of the target database. */
  url: string
  /** Directory of *.sql migrations, applied in filename order. */
  dir: string
  /** CREATE the target DB if missing (connects to /postgres). */
  createDatabase?: boolean
  /** Apply into a schema of a shared DB (search_path), created if missing.
   *  Omit for the DB's default. Splittable onto its own DB later. */
  schema?: string
}

/** Apply pending migrations; returns the filenames applied. */
export function runMigrations(opts: MigrateOptions): Promise<string[]> {
  return migrate(opts.url, opts.dir, { createDatabase: opts.createDatabase, schema: opts.schema })
}

export { ensureDatabase }
