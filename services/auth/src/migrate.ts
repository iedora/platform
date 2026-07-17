import { join } from "node:path";

import { env, expandFileSecrets, requireEnv, runMigrations } from "@iedora/server-kit";

// One-shot migrator: applies services/auth/migrations/*.sql to AUTH_DATABASE_URL
// (creating the database if missing), then exits.
expandFileSecrets();

const applied = await runMigrations({
  url: requireEnv("AUTH_DATABASE_URL"),
  dir: join(import.meta.dir, "..", "migrations"),
  createDatabase: true,
  schema: env("DB_SCHEMA", "auth"),
});

console.log(
  JSON.stringify({ level: "info", msg: "migrations applied", service: "iedora-auth", applied }),
);
