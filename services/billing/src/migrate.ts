import { join } from "node:path";

import { expandFileSecrets, requireEnv, runMigrations } from "@iedora/server-kit";

// One-shot migrator: applies services/billing/migrations/*.sql to
// BILLING_DATABASE_URL (creating the database if missing), then exits.
expandFileSecrets();

const applied = await runMigrations({
  url: requireEnv("BILLING_DATABASE_URL"),
  dir: join(import.meta.dir, "..", "migrations"),
  createDatabase: true,
});

console.log(
  JSON.stringify({ level: "info", msg: "migrations applied", service: "iedora-billing", applied }),
);
