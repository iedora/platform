# @iedora/db

Kysely-over-Postgres, runtime-agnostic. Bun's native `SQL` on Bun, `postgres.js`
on Node — same code either way.

- **`createDb<DB>(url, opts)`** → a `Kysely` (CamelCasePlugin on by default).
- **`Database<DB>`** — the same, plus tx-in-context: `.db` is the active
  transaction inside `runInTx`, else the pool. Repos read `.db`, never thread a `tx`.
- **`migrate(url, dir, opts)`** — raw-`*.sql` runner: session advisory lock, one
  transaction per file, `-- no-transaction` header opt-out for `CREATE INDEX CONCURRENTLY`.
- **`schema` option** (on `migrate` / `Database`, not a standalone export) — pin a
  service to one schema via `search_path`; `withSearchPath(db, schema, fn)` runs a
  block under a schema. Splittable onto its own DB later, no code change.
- **`ensureDatabaseRole(adminUrl, opts)`** — the primary model, database-per-service
  on one server:
  a login role owns its OWN database, `CONNECT` revoked from PUBLIC. Postgres has
  no cross-database queries, so a service can reach ONLY its own database
  (`permission denied for database …`). Isolated as if fully independent; future
  split = `pg_dump` + restore + DSN swap.
- **`ensureSchemaRole(url, opts)`** — the lighter alternative: many services in
  ONE database, a login role granted only its own schema (`permission denied for
  schema …`). Use when you want one DB but hard per-service walls.
- Error/date helpers: `sqlState`, `isUniqueViolation`, `iso`, `isoOpt`.

```ts
import { Database, migrate } from "@iedora/db"

await migrate(process.env.DATABASE_URL!, "./migrations", { schema: "billing", createDatabase: true })

const db = new Database<DB>(process.env.DATABASE_URL!, { schema: "billing" })
await db.runInTx(async () => {
  await db.db.insertInto("invoice").values({ ... }).execute()   // joins the tx automatically
})
```

Enforce the schema boundary in Postgres (run migrate as an admin, then):

```ts
import { ensureSchemaRole } from "@iedora/db"

await ensureSchemaRole(ADMIN_URL, { schema: "billing", role: "billing", password: SECRET })
// then run the service as its role:
//   postgres://billing:SECRET@host/db?options=-c search_path=billing
```

Node consumers install the peer: `npm i postgres`. Bun consumers don't.
`DB_DRIVER=postgres` forces postgres.js on Bun.
