import { join } from "node:path";

import { env, expandFileSecrets, requireEnv, runMigrations } from "@iedora/service-runtime";

// One-shot migrator: provisions auth's OWN database + isolated role (prod), then
// applies services/auth/migrations/*.sql into it, then exits. Database per
// service: the runtime connects to its own database (AUTH_DATABASE_URL) and can't
// reach any other service's data. In prod, ADMIN_DATABASE_URL (a superuser on
// /postgres) creates the db + role; in dev it's unset and the shared superuser
// migrates its own db directly.
expandFileSecrets();

const applied = await runMigrations({
  url: requireEnv("AUTH_DATABASE_URL"),
  dir: join(import.meta.dir, "..", "migrations"),
  createDatabase: true,
  adminUrl: env("ADMIN_DATABASE_URL", ""),
  database: env("DB_NAME", "auth"),
  role: env("DB_ROLE", "auth"),
  rolePassword: env("DB_ROLE_PASSWORD", ""),
});

console.log(
  JSON.stringify({ level: "info", msg: "migrations applied", service: "iedora-auth", applied }),
);
