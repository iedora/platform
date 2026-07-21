import { createRequire } from "node:module"

// Runtime-agnostic Postgres driver. @iedora/db speaks to Postgres through the
// kysely-postgres-js dialect, which wants a postgres.js-shaped client. Bun ships
// a native, API-compatible `SQL` (fastest on Bun); on Node (or Deno, etc.) we
// fall back to the `postgres` package, which has the SAME surface (tagged
// template, .reserve(), .unsafe(), .end()). So the package is generic to ANY
// runtime, not just Bun — a Next.js app on Node and a Bun.serve service share it.
//
// Bun is detected via `globalThis.Bun.SQL` so there is NO static `import from
// "bun"` (which would crash at import time on Node). `postgres` is loaded lazily
// via createRequire, so Bun consumers never need it installed.

export type DriverOptions = {
  poolMax?: number
  idleTimeout?: number // seconds
  maxLifetime?: number // seconds
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the two clients share a structural surface
type PostgresLike = any

const nodeRequire = createRequire(import.meta.url)

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Bun global is untyped here
const BunSQL: (new (url: string, opts: unknown) => PostgresLike) | undefined = (globalThis as any).Bun
  ?.SQL

/** Build a postgres.js-compatible client for the current runtime. */
export function makeSql(url: string, opts: DriverOptions = {}): PostgresLike {
  const max = opts.poolMax ?? 10
  const idle = opts.idleTimeout ?? 30
  const life = opts.maxLifetime ?? 600

  // `DB_DRIVER=postgres` forces postgres.js even on Bun (parity testing,
  // or a Bun user who prefers it).
  const forcePg = process.env.DB_DRIVER === "postgres" || process.env.DB_DRIVER === "node"

  if (BunSQL && !forcePg) {
    // Bun's native driver.
    return new BunSQL(url, { max, idleTimeout: idle, maxLifetime: life })
  }

  // Non-Bun runtime → postgres.js (option names are snake_case there).
  let mod: { default?: unknown } | unknown
  try {
    mod = nodeRequire("postgres")
  } catch {
    throw new Error(
      "@iedora/db on a non-Bun runtime needs the `postgres` package — install it (`npm i postgres` / `bun add postgres`).",
    )
  }
  // Interop: require() may hand back the ESM namespace ({ default: fn }) or the fn.
  const postgres = ((mod as { default?: unknown }).default ?? mod) as (
    url: string,
    opts: unknown,
  ) => PostgresLike
  return postgres(url, { max, idle_timeout: idle, max_lifetime: life })
}
