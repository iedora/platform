import { join } from "node:path"

import { env, expandFileSecrets, requireEnv, runMigrations } from "@iedora/service-kit"

// One-shot migrator: provisions email's OWN database + isolated role (prod), then
// applies migrations/*.sql into it, then exits. Database per service — the runtime
// connects to its own database (EMAIL_DATABASE_URL) only. The only table is the
// @iedora/messaging inbox that makes delivery idempotent.
expandFileSecrets()

const applied = await runMigrations({
  url: requireEnv("EMAIL_DATABASE_URL"),
  dir: join(import.meta.dir, "..", "migrations"),
  createDatabase: true,
  adminUrl: env("ADMIN_DATABASE_URL", ""),
  database: env("DB_NAME", "email"),
  role: env("DB_ROLE", "email"),
  rolePassword: env("DB_ROLE_PASSWORD", ""),
})

console.log(
  JSON.stringify({ level: "info", msg: "migrations applied", service: "iedora-email", applied }),
)
