import { MIGRATIONS_DIR } from "#db/migrate"
import { env, expandFileSecrets, requireEnv, runMigrations } from "@iedora/service-kit"

// tutor-api owns the tutor database, so it migrates before boot (the Bun
// entrypoint runs this when present). Uses the framework's advisory-lock runner
// against the SAME DSN the service serves with. The tutor DB is pre-provisioned
// by ops in prod, so only dev asks the runner to create it.
expandFileSecrets()

const applied = await runMigrations({
  url: requireEnv("TUTOR_DATABASE_URL"),
  dir: MIGRATIONS_DIR,
  createDatabase: env("NODE_ENV", "") !== "production",
})

console.log(
  JSON.stringify({
    level: "info",
    msg: applied.length ? `applied ${applied.length} migration(s)` : "migrations up to date",
    service: "iedora-tutor-api",
    count: applied.length,
  }),
)
