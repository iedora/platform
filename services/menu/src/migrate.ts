import { join } from "node:path";

import { env, expandFileSecrets, requireEnv, runMigrations } from "@iedora/server-kit";

// One-shot migrator: applies services/menu/migrations/*.sql to MENU_DATABASE_URL
// (creating the database if missing), then exits.
expandFileSecrets();

const applied = await runMigrations({
  url: requireEnv("MENU_DATABASE_URL"),
  dir: join(import.meta.dir, "..", "migrations"),
  createDatabase: true,
  schema: env("DB_SCHEMA", "menu"),
});

console.log(
  JSON.stringify({ level: "info", msg: "migrations applied", service: "iedora-menu", applied }),
);
