import { afterAll, beforeAll, expect, test } from "vitest"
import { type Kysely, sql } from "kysely"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createDb, ensureDatabaseRole, ensureSchemaRole, migrate } from "../../src/index.ts"

// Proves the hard rule at the engine level: a role scoped to schema A cannot
// read schema B — Postgres denies it, not a code convention.
const HAS_DB = Boolean(process.env.DATABASE_URL)
const it = test.skipIf(!HAS_DB)

const ADMIN = process.env.DATABASE_URL ?? "postgres://x/y"
const PW = "role_iso_pw"

 
function roleUrl(role: string, schema: string): string {
  const u = new URL(ADMIN)
  u.username = role
  u.password = PW
  u.search = `?options=-c%20search_path%3D${schema}`
  return u.toString()
}

async function exec(db: Kysely<unknown>, text: string): Promise<void> {
  await sql.raw(text).execute(db)
}

async function migrateSchema(schema: string, table: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), `roleiso_${schema}_`))
  await writeFile(join(dir, "0001_init.sql"), `CREATE TABLE ${table} (id int); INSERT INTO ${table} VALUES (1);`)
  await migrate(ADMIN, dir, { schema, log: false })
}

beforeAll(async () => {
  if (!HAS_DB) return
  const admin = createDb(ADMIN)
  await exec(admin, `DROP OWNED BY svc_iso_a CASCADE`).catch(() => {})
  await exec(admin, `DROP SCHEMA IF EXISTS iso_a CASCADE`)
  await exec(admin, `DROP SCHEMA IF EXISTS iso_b CASCADE`)
  await exec(admin, `DROP ROLE IF EXISTS svc_iso_a`).catch(() => {})
  await admin.destroy()
  await migrateSchema("iso_a", "widget")
  await migrateSchema("iso_b", "secret")
})

afterAll(async () => {
  if (!HAS_DB) return
  const admin = createDb(ADMIN)
  await exec(admin, `DROP OWNED BY svc_iso_a CASCADE`).catch(() => {})
  await exec(admin, `DROP SCHEMA IF EXISTS iso_a CASCADE`)
  await exec(admin, `DROP SCHEMA IF EXISTS iso_b CASCADE`)
  await exec(admin, `DROP ROLE IF EXISTS svc_iso_a`).catch(() => {})
  await exec(admin, `GRANT ALL ON SCHEMA public TO PUBLIC`).catch(() => {}) // restore dev default
  await admin.destroy()
})

it("a schema-scoped role reads its own schema but is denied every other", async () => {
  await ensureSchemaRole(ADMIN, { schema: "iso_a", role: "svc_iso_a", password: PW })

  const svc = createDb(roleUrl("svc_iso_a", "iso_a"))
  try {
    const own = await sql<{ id: number }>`SELECT id FROM iso_a.widget`.execute(svc)
    expect(own.rows[0]?.id).toBe(1)

    await expect(sql`SELECT id FROM iso_b.secret`.execute(svc)).rejects.toThrow(
      /permission denied for schema iso_b/,
    )
  } finally {
    await svc.destroy()
  }
})

it("is idempotent (safe to run on every deploy)", async () => {
  await ensureSchemaRole(ADMIN, { schema: "iso_a", role: "svc_iso_a", password: PW })
  await ensureSchemaRole(ADMIN, { schema: "iso_a", role: "svc_iso_a", password: PW })
  const svc = createDb(roleUrl("svc_iso_a", "iso_a"))
  try {
    const own = await sql<{ id: number }>`SELECT id FROM iso_a.widget`.execute(svc)
    expect(own.rows[0]?.id).toBe(1)
  } finally {
    await svc.destroy()
  }
})

// ── database-per-service isolation ──────────────────────────────────────────
// The stronger model: each service owns a DATABASE + role; Postgres has no
// cross-database queries, and CONNECT is scoped to the role, so another
// service's database is unreachable at the engine.
function dbUrl(role: string, pw: string, database: string): string {
  const u = new URL(ADMIN)
  u.username = role
  u.password = pw
  u.pathname = `/${database}`
  u.search = ""
  return u.toString()
}

async function dropDb(admin: Kysely<unknown>, name: string): Promise<void> {
  // Terminate stray backends first so DROP DATABASE isn't blocked.
  await sql
    .raw(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}'`)
    .execute(admin)
    .catch(() => {})
  await sql.raw(`DROP DATABASE IF EXISTS ${name}`).execute(admin).catch(() => {})
}

const DBA = "dbiso_a"
const DBB = "dbiso_b"

beforeAll(async () => {
  if (!HAS_DB) return
  const admin = createDb(ADMIN)
  await dropDb(admin, DBA)
  await dropDb(admin, DBB)
  await sql.raw(`DROP ROLE IF EXISTS ${DBA}`).execute(admin).catch(() => {})
  await sql.raw(`DROP ROLE IF EXISTS ${DBB}`).execute(admin).catch(() => {})
  await admin.destroy()
})

afterAll(async () => {
  if (!HAS_DB) return
  const admin = createDb(ADMIN)
  await dropDb(admin, DBA)
  await dropDb(admin, DBB)
  await sql.raw(`DROP ROLE IF EXISTS ${DBA}`).execute(admin).catch(() => {})
  await sql.raw(`DROP ROLE IF EXISTS ${DBB}`).execute(admin).catch(() => {})
  await admin.destroy()
})

it("a database-scoped role owns its database but cannot reach another", async () => {
  await ensureDatabaseRole(ADMIN, { database: DBA, role: DBA, password: "pwa" })
  await ensureDatabaseRole(ADMIN, { database: DBB, role: DBB, password: "pwb" })

  // Role A owns its DB: can create + read a table there.
  const a = createDb(dbUrl(DBA, "pwa", DBA))
  try {
    await sql.raw(`CREATE TABLE t (id int)`).execute(a)
    await sql.raw(`INSERT INTO t VALUES (1)`).execute(a)
    const own = await sql<{ id: number }>`SELECT id FROM t`.execute(a)
    expect(own.rows[0]?.id).toBe(1)
  } finally {
    await a.destroy()
  }

  // Role A cannot even CONNECT to B's database.
  const aIntoB = createDb(dbUrl(DBA, "pwa", DBB))
  try {
    await expect(sql`SELECT 1`.execute(aIntoB)).rejects.toThrow(/permission denied for database/)
  } finally {
    await aIntoB.destroy()
  }
})
