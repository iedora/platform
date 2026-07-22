import { migrate } from "@iedora/db"

import { config } from "./config.ts"

// Raw *.sql files under ./migrations_sql, applied in filename order by the
// framework's advisory-lock runner (one transaction per file, session-level
// pg_advisory_lock on a reserved connection). retries: 5 rides out a transient
// connection blip on deploy.
const dir = new URL("./migrations_sql", import.meta.url).pathname

async function main() {
  try {
    // createDatabase: create the DB if missing, like every other service. No-ops
    // in prod (the DB already exists) since the check runs before any CREATE.
    const applied = await migrate(config.databaseUrl, dir, { retries: 5, createDatabase: true })
    console.log(applied.length ? `Applied ${applied.length} migration(s).` : "Migrations up to date.")
  } catch (error) {
    console.error("Migration failed:", error)
    process.exitCode = 1
  }
}

void main()
