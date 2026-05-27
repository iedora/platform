import 'server-only'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'

/**
 * postgres-js connection options. Subset of the upstream type, kept
 * narrow on purpose — consumers picking esoteric options is a smell.
 */
export interface CreateDbOptions {
  /** Connection pool size. Default 10. */
  max?: number
  /** Disable prepared statements (required by pgbouncer transaction mode). */
  prepare?: boolean
  /**
   * Key used in `globalThis` for HMR-safe singleton caching. Must be
   * unique per database in the process. Use a string like
   * `'iedora/menu'`. When omitted, no global cache (production worker
   * mode where each worker gets one client).
   */
  cacheKey?: string
}

/**
 * Returns a drizzle client typed by the consumer's schema, paired with
 * helpers that operate on it. One factory per product database.
 *
 * Why a factory and not a free-standing `db` export: each product has
 * its own `<PRODUCT>_DATABASE_URL` and its own schema. A factory keeps the
 * postgres-js + drizzle wiring identical across products without
 * leaking either one's connection or schema types into the other.
 *
 * The factory caches the underlying postgres-js client on `globalThis`
 * when `cacheKey` is provided. Next 16 HMR re-evaluates server modules
 * on every code change, which would create a new pool on each reload
 * and eventually exhaust Postgres connections without a cache.
 * Production workers don't go through HMR — omit the key there or
 * use a unique-per-worker key to keep the same shape.
 */
export function createDb<TSchema extends Record<string, unknown>>(
  url: string,
  schema: TSchema,
  opts: CreateDbOptions = {},
): {
  db: PostgresJsDatabase<TSchema>
  ping: (timeoutMs: number) => Promise<void>
  close: (opts?: { timeout?: number }) => Promise<void>
} {
  type Client = ReturnType<typeof postgres>

  const { max = 10, prepare = false, cacheKey } = opts

  let conn: Client
  if (cacheKey) {
    const cache = globalThis as unknown as Record<string, Client | undefined>
    if (cache[cacheKey]) {
      conn = cache[cacheKey]!
    } else {
      conn = postgres(url, { max, prepare })
      cache[cacheKey] = conn
    }
  } else {
    conn = postgres(url, { max, prepare })
  }

  const db = drizzle(conn, { schema, casing: 'snake_case' }) as PostgresJsDatabase<TSchema>

  return {
    db,
    /**
     * Round-trip the connection with `SELECT 1`, racing a timeout.
     * Used by health-check routes — keep import surface small.
     */
    async ping(timeoutMs: number): Promise<void> {
      await Promise.race([
        db.execute(sql`SELECT 1`),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`db ping timed out after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ])
    },
    /**
     * Graceful pool drain. Call from `instrumentation.ts` on SIGTERM /
     * SIGINT. `timeout` is seconds — matches postgres-js's
     * `sql.end({ timeout })` semantics.
     */
    async close(closeOpts: { timeout?: number } = {}): Promise<void> {
      await conn.end({ timeout: closeOpts.timeout ?? 5 })
      if (cacheKey) {
        const cache = globalThis as unknown as Record<string, Client | undefined>
        if (cache[cacheKey] === conn) cache[cacheKey] = undefined
      }
    },
  }
}
