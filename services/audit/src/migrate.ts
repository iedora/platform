import { join } from "node:path";

import { expandFileSecrets, requireEnv, runMigrations } from "@iedora/server-kit";

// One-shot migrator: applies services/audit/migrations/*.sql to AUDIT_DATABASE_URL
// (creating the database if missing), then exits. Mirrors `iedora audit migrate`.
expandFileSecrets();

const applied = await runMigrations({
  url: requireEnv("AUDIT_DATABASE_URL"),
  dir: join(import.meta.dir, "..", "migrations"),
  createDatabase: true,
});

console.log(
  JSON.stringify({ level: "info", msg: "migrations applied", service: "iedora-audit", applied }),
);
