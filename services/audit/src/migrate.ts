import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { env, expandFileSecrets, requireEnv, runMigrations } from "@iedora/service-kit"

// One-shot migrator: provisions audit's OWN database + isolated role (prod), then
// applies migrations/*.sql into it, then exits. Database per service — the runtime
// connects to its own database (AUDIT_DATABASE_URL) only. In prod
// ADMIN_DATABASE_URL (superuser on /postgres) creates the db + role; dev leaves it
// unset and the shared superuser migrates its own db directly.
expandFileSecrets()

const applied = await runMigrations({
  url: requireEnv("AUDIT_DATABASE_URL"),
  dir: join(dirname(fileURLToPath(import.meta.url)), "..", "migrations"),
  createDatabase: true,
  adminUrl: env("ADMIN_DATABASE_URL", ""),
  database: env("DB_NAME", "audit"),
  role: env("DB_ROLE", "audit"),
  rolePassword: env("DB_ROLE_PASSWORD", ""),
})

console.log(
  JSON.stringify({ level: "info", msg: "migrations applied", service: "iedora-audit", applied }),
)
