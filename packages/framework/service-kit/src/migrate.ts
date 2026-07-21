// Menu services' migration entrypoint, backed by @iedora/db's advisory-lock
// runner (raw *.sql files, session-level pg_advisory_lock on a reserved
// connection, one transaction per file). Same shape services already call.
//
// DATABASE PER SERVICE. Each service owns its OWN database on the shared Postgres
// server and, in prod, connects as a LOGIN role scoped to ONLY that database
// (CONNECT revoked from PUBLIC). Postgres has no cross-database queries, so a
// service physically can't reach another's data — isolation as if each were a
// fully independent database, and the future split to a dedicated server is a
// `pg_dump <db>` + restore + DSN swap with zero code change.
import { ensureDatabase, ensureDatabaseRole, migrate } from "@iedora/db"

export interface MigrateOptions {
  /** The service's runtime DSN — its OWN database. In prod this carries the
   *  service's role + password; in dev it's the shared superuser on its own DB. */
  url: string
  /** Directory of *.sql migrations, applied in filename order. */
  dir: string
  /** CREATE the target DB if missing (connects to /postgres). Dev convenience;
   *  in the provisioned path the DB is created by `ensureDatabaseRole` instead. */
  createDatabase?: boolean
  /** Provision the service's own database + isolated role (database-per-service).
   *  When `adminUrl`, `database`, `role`, and `rolePassword` are all set, the role
   *  and database are created/confirmed via the admin DSN, then migrations run as
   *  the role against `url`. Skipped otherwise (dev = shared superuser). */
  adminUrl?: string
  database?: string
  role?: string
  rolePassword?: string
}

/** Apply pending migrations; returns the filenames applied. Provisions the
 *  service's own database + role first when the admin/role options are supplied. */
export async function runMigrations(opts: MigrateOptions): Promise<string[]> {
  if (opts.adminUrl && opts.database && opts.role && opts.rolePassword) {
    // Prod: create the isolated database + role as admin, then migrate AS the
    // role into its own database (opts.url already carries the role credentials).
    await ensureDatabaseRole(opts.adminUrl, {
      database: opts.database,
      role: opts.role,
      password: opts.rolePassword,
    })
    return migrate(opts.url, opts.dir, {})
  }
  // Dev / legacy: migrate against url, creating the database if asked.
  return migrate(opts.url, opts.dir, { createDatabase: opts.createDatabase })
}

export { ensureDatabase }
