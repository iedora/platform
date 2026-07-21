import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path";

import { env, expandFileSecrets, requireEnv, runMigrations } from "@iedora/service-runtime";

// One-shot migrator: provisions menu's OWN database + isolated role (prod), then
// applies products/menu/api/migrations/*.sql into it, then exits. Database per
// service — the runtime connects to its own database (MENU_DATABASE_URL) only.
// In prod ADMIN_DATABASE_URL (superuser on /postgres) creates the db + role; dev
// leaves it unset and the shared superuser migrates its own db directly.
expandFileSecrets();

const applied = await runMigrations({
  url: requireEnv("MENU_DATABASE_URL"),
  dir: join(dirname(fileURLToPath(import.meta.url)), "..", "migrations"),
  createDatabase: true,
  adminUrl: env("ADMIN_DATABASE_URL", ""),
  database: env("DB_NAME", "menu"),
  role: env("DB_ROLE", "menu"),
  rolePassword: env("DB_ROLE_PASSWORD", ""),
});

console.log(
  JSON.stringify({ level: "info", msg: "migrations applied", service: "iedora-menu", applied }),
);
