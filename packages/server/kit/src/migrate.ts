import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { SQL } from "bun";

// Ports the Go internal/migrate package: ensure the database exists, take a
// Postgres advisory lock so concurrent deploys serialize, then apply each
// *.sql file (in filename order) that hasn't run yet, recording it in
// schema_migrations. The existing goose-annotated SQL files apply verbatim —
// goose's `-- +goose` lines are SQL comments, and Bun's SQL.unsafe(text) runs
// the whole multi-statement file (dollar-quoted bodies included) in one go.

const LOCK_KEY = 4_021_977; // stable, single-purpose migration advisory lock

export interface MigrateOptions {
  url: string; // DSN of the target database
  dir: string; // directory of *.sql migrations, applied in filename order
  createDatabase?: boolean; // CREATE the target DB if missing (connects to /postgres)
}

function dbName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

function adminUrl(url: string): string {
  const u = new URL(url);
  u.pathname = "/postgres";
  return u.toString();
}

async function ensureDatabase(url: string): Promise<void> {
  const name = dbName(url);
  const admin = new SQL(adminUrl(url));
  try {
    const rows = (await admin.unsafe("SELECT 1 FROM pg_database WHERE datname = $1", [
      name,
    ])) as unknown[];
    if (rows.length === 0) await admin.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
}

/** Applies pending migrations and returns the filenames that were applied. */
export async function runMigrations(opts: MigrateOptions): Promise<string[]> {
  if (opts.createDatabase) await ensureDatabase(opts.url);

  const pool = new SQL(opts.url);
  const conn = await pool.reserve(); // one dedicated connection holds the lock
  const applied: string[] = [];
  try {
    await conn.unsafe(`SELECT pg_advisory_lock(${LOCK_KEY})`);
    await conn.unsafe(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version    text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const doneRows = (await conn.unsafe("SELECT version FROM schema_migrations")) as {
      version: string;
    }[];
    const done = new Set(doneRows.map((r) => r.version));

    const files = readdirSync(opts.dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      if (done.has(file)) continue;
      await conn.unsafe(readFileSync(join(opts.dir, file), "utf8"));
      await conn.unsafe("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      applied.push(file);
    }
  } finally {
    await conn.unsafe(`SELECT pg_advisory_unlock(${LOCK_KEY})`).catch(() => {});
    conn.release();
    await pool.end();
  }
  return applied;
}
