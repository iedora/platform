import { makeSql } from "./driver.ts"

// Per-schema role isolation. In a shared database with a schema per service,
// `search_path` keeps a service's queries in its own schema by CONVENTION — but
// any connection with the shared superuser can still read every other schema.
// This turns that convention into a HARD, Postgres-enforced boundary: a login
// role granted USAGE on EXACTLY one schema and nothing else. A service that
// connects as its role physically cannot touch another service's tables
// (`permission denied for schema …`), so "services never communicate through
// the database" is guaranteed by the engine, not trusted to code review.

/** Quote an identifier (schema/role name) — doubles embedded quotes. */
function ident(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    // Fall back to explicit quoting for anything non-trivial; still reject a
    // literal double-quote to avoid any breakout.
    if (name.includes('"')) throw new Error(`unsafe identifier: ${name}`)
    return `"${name}"`
  }
  return `"${name}"`
}

/** Quote a string literal (role password) — doubles embedded single quotes. */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export interface SchemaRoleOptions {
  /** The schema the role is confined to (must already exist — run after migrate). */
  schema: string
  /** The LOGIN role name. Often the same as `schema`. */
  role: string
  /** The role's login password (from a secret; wire it into the service's DATABASE_URL). */
  password: string
  /** Also strip default PUBLIC privileges on the `public` schema, so services
   *  can't use `public` as a shared back-channel. Default true. */
  lockdownPublic?: boolean
}

/**
 * Create or update a LOGIN role scoped to EXACTLY one schema, enforcing at the
 * Postgres level that the service can only reach its own schema. Idempotent —
 * safe to run on every deploy, right after {@link migrate}. Must run as a
 * superuser or the schemas' owner (the same identity migrations run as), because
 * it creates a role and grants across the schema.
 *
 * A fresh role has NO privilege on any schema it isn't granted, so isolation is
 * the *absence* of a grant: this only ever grants the role its own schema and
 * never mentions another, which is why it can't leak. `ALTER DEFAULT PRIVILEGES`
 * makes future tables (created by the migrating identity) auto-grant to the role.
 *
 * ```ts
 * await migrate(DATABASE_URL, dir, { schema: "menu" })
 * await ensureSchemaRole(DATABASE_URL, { schema: "menu", role: "menu", password: SECRET })
 * // then run the menu service with DATABASE_URL = postgres://menu:SECRET@host/db?options=-c search_path=menu
 * ```
 */
export async function ensureSchemaRole(url: string, opts: SchemaRoleOptions): Promise<void> {
  const schema = ident(opts.schema)
  const role = ident(opts.role)
  const admin = makeSql(url, { poolMax: 2 })
  const run = (s: string) => admin.unsafe(s)
  try {
    // Idempotent CREATE ROLE (no CREATE ROLE IF NOT EXISTS in Postgres).
    await run(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${lit(opts.role)}) THEN
           CREATE ROLE ${role} LOGIN;
         END IF;
       END $$`,
    )
    await run(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${lit(opts.password)}`)

    // Deny the shared `public` schema as a cross-service stash (both the role's
    // and everyone's default access to it).
    if (opts.lockdownPublic !== false) {
      await run(`REVOKE ALL ON SCHEMA public FROM PUBLIC`)
      await run(`REVOKE ALL ON SCHEMA public FROM ${role}`)
    }

    // Grant EXACTLY this schema. No other schema is ever named, so the role has
    // no path to another service's tables.
    await run(`GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${role}`)
    await run(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schema} TO ${role}`)
    await run(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`)
    // Future tables/sequences created by the migrating identity auto-grant.
    await run(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT ALL ON TABLES TO ${role}`)
    await run(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT ALL ON SEQUENCES TO ${role}`)
  } finally {
    await admin.end()
  }
}

/** Point a DSN at a different database (swap the path), keeping host/creds/query. */
function withDatabase(url: string, database: string): string {
  const u = new URL(url)
  u.pathname = `/${database}`
  return u.toString()
}

export interface DatabaseRoleOptions {
  /** The service's OWN database (created if missing, owned by the role). */
  database: string
  /** The LOGIN role that owns the database. Often the same as `database`. */
  role: string
  /** The role's login password (must match the one in the service's runtime DSN). */
  password: string
  /** Revoke PUBLIC on the new database's `public` schema and hand it to the role.
   *  Default true. */
  lockdownPublic?: boolean
}

/**
 * Provision a service's OWN database on a shared Postgres server, isolated as if
 * it were a fully independent database. Creates a LOGIN role (NO superuser /
 * createdb / createrole), a database OWNED by it, and scopes `CONNECT` to that
 * role only (revoked from PUBLIC) — so the role can reach ONLY its own database
 * and, because Postgres has no cross-database queries, nothing else. The future
 * split to a dedicated server is a `pg_dump <database>` + restore + a DSN swap,
 * with zero code change.
 *
 * Idempotent; run as a superuser (the migrate admin). Must connect to a
 * MAINTENANCE database (e.g. `postgres`) since `CREATE DATABASE` can't run inside
 * another database's transaction — pass an admin DSN whose path is `/postgres`.
 *
 * ```ts
 * await ensureDatabaseRole(ADMIN_URL, { database: "menu", role: "menu", password: SECRET })
 * await migrate(`postgres://menu:SECRET@host/menu`, dir)   // migrate AS the role, into its own DB
 * ```
 */
export async function ensureDatabaseRole(adminUrl: string, opts: DatabaseRoleOptions): Promise<void> {
  const db = ident(opts.database)
  const role = ident(opts.role)

  // 1) On the maintenance DB: role + database + connect scoping. Each statement
  //    autocommits (CREATE DATABASE can't be transactional).
  const admin = makeSql(adminUrl, { poolMax: 2 })
  try {
    await admin.unsafe(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${lit(opts.role)}) THEN
           CREATE ROLE ${role} LOGIN;
         END IF;
       END $$`,
    )
    // Least privilege: an app role never needs these cluster-wide attributes.
    await admin.unsafe(`ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${lit(opts.password)}`)

    const exists = (await admin`SELECT 1 FROM pg_database WHERE datname = ${opts.database}`) as unknown[]
    if (exists.length === 0) await admin.unsafe(`CREATE DATABASE ${db} OWNER ${role}`)
    else await admin.unsafe(`ALTER DATABASE ${db} OWNER TO ${role}`)

    // Only this role may connect to this database.
    await admin.unsafe(`REVOKE CONNECT ON DATABASE ${db} FROM PUBLIC`)
    await admin.unsafe(`GRANT CONNECT ON DATABASE ${db} TO ${role}`)
  } finally {
    await admin.end()
  }

  // 2) Inside the new database: hand `public` to the role, strip PUBLIC. Owning
  //    the schema means migrations run as the role and objects are role-owned.
  if (opts.lockdownPublic !== false) {
    const dbAdmin = makeSql(withDatabase(adminUrl, opts.database), { poolMax: 2 })
    try {
      await dbAdmin.unsafe(`ALTER SCHEMA public OWNER TO ${role}`)
      await dbAdmin.unsafe(`REVOKE ALL ON SCHEMA public FROM PUBLIC`)
      await dbAdmin.unsafe(`GRANT ALL ON SCHEMA public TO ${role}`)
    } finally {
      await dbAdmin.end()
    }
  }
}
