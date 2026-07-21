import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Generated, type Kysely, sql } from "kysely"

import { createDb, migrate } from "../../src/index"

const HAS_DB = Boolean(process.env.DATABASE_URL)
const it = test.skipIf(!HAS_DB)

interface Widget {
  id: Generated<number>
  name: string | null
  // snake_case in the DB (unit_price); camelCase in TS proves CamelCasePlugin.
  unitPrice: number | null
}
interface TestDB {
  widget: Widget
}

// Raw SQL migrations — the canonical format the runner applies.
const FILES: Record<string, string> = {
  "0001_widget.sql": `
    CREATE TABLE widget (
      id   serial PRIMARY KEY,
      name text
    );`,
  "0002_price.sql": `ALTER TABLE widget ADD COLUMN unit_price integer;`,
  // Non-transactional file (CREATE INDEX CONCURRENTLY can't run in a txn);
  // idempotent so a partial failure is safe to re-run.
  "0003_index.sql": `-- no-transaction
    CREATE INDEX CONCURRENTLY IF NOT EXISTS widget_name_idx ON widget (name);`,
}

let db: Kysely<TestDB>
let dir: string

describe("createDb + migrate (Bun SQL, advisory-lock runner)", () => {
  beforeAll(async () => {
    if (!HAS_DB) return
    const admin = createDb<TestDB>(process.env.DATABASE_URL!)
    await sql`DROP TABLE IF EXISTS widget, schema_migrations`.execute(admin)
    await admin.destroy()

    dir = await mkdtemp(join(tmpdir(), "iedora-mig-"))
    for (const [name, body] of Object.entries(FILES)) await writeFile(join(dir, name), body)

    db = createDb<TestDB>(process.env.DATABASE_URL!)
  })
  afterAll(async () => {
    if (HAS_DB) await db.destroy()
  })

  it("applies migrations (incl. a no-transaction file) and maps snake_case <-> camelCase", async () => {
    // retries: 3 rides out the flaky pg18-alpine/Docker-on-ARM backend crash.
    const applied = await migrate(process.env.DATABASE_URL!, dir, { log: false, retries: 3 })
    expect(applied).toEqual(["0001_widget.sql", "0002_price.sql", "0003_index.sql"])

    await db.insertInto("widget").values({ name: "gizmo", unitPrice: 5 }).execute()
    const row = await db
      .selectFrom("widget")
      .selectAll()
      .where("name", "=", "gizmo")
      .executeTakeFirstOrThrow()
    // Stored in column unit_price, read back as unitPrice → both migrations applied + CamelCase works.
    expect(row.unitPrice).toBe(5)
  })

  it("is idempotent — a second run applies nothing", async () => {
    const applied = await migrate(process.env.DATABASE_URL!, dir, { log: false, retries: 3 })
    expect(applied).toEqual([])
  })
})
