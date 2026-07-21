import postgres from "postgres"

import { runMigrations } from "./migrate.ts"

// Bun-native test database harness. We do NOT use testcontainers: under Bun it
// hangs — Bun starts the container so fast that testcontainers-node attaches its
// wait strategy after the container's log stream has already closed, so start()
// never resolves (testcontainers/testcontainers-node#974, no released fix; the
// hang happens regardless of wait strategy). Instead each test provisions a
// uniquely-named throwaway database on a real Postgres (the OrbStack dev
// instance locally, a pg service in CI), migrates it, and drops it on teardown.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://iedora:iedora@localhost:55433/postgres"

function urlFor(db: string): string {
  const u = new URL(ADMIN_URL)
  u.pathname = `/${db}`
  return u.toString()
}

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

export interface ScratchDatabase {
  /** Connection string for the freshly-created database. */
  url: string
  /** Terminates connections and drops the database. Call in afterAll. */
  drop: () => Promise<void>
}

/**
 * Creates a uniquely-named database on the test Postgres, optionally applying
 * the migrations in `migrationsDir`. Returns its URL and a drop() for teardown.
 */
export async function createScratchDatabase(
  opts: { prefix?: string; migrationsDir?: string } = {},
): Promise<ScratchDatabase> {
  const name = uniqueName(opts.prefix ?? "test")
  const admin = postgres(ADMIN_URL, { max: 2 })
  await admin.unsafe(`CREATE DATABASE "${name}"`)
  await admin.end()

  const url = urlFor(name)
  if (opts.migrationsDir) await runMigrations({ url, dir: opts.migrationsDir })

  return {
    url,
    drop: async () => {
      const a = postgres(ADMIN_URL, { max: 2 })
      await a
        .unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [name])
        .catch(() => {})
      await a.unsafe(`DROP DATABASE IF EXISTS "${name}"`).catch(() => {})
      await a.end()
    },
  }
}
