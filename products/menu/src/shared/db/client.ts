import 'server-only'
import { createDb } from '@iedora/db'
import { env } from '../env'
import * as schema from './schema'

/**
 * Menu's Postgres client. Connects to the `menu` database (served from
 * the shared `infra-postgres` container in prod). Drizzle types are
 * scoped to `./schema` — no leak of other products' tables.
 *
 * The shared drizzle + postgres-js wiring lives in `@iedora/db`; this
 * file just binds it to menu's env + schema. cacheKey is unique
 * per-product so HMR-safe caches don't collide if a future feature
 * imports another product's db handle in the same process.
 */
const handle = createDb(env.MENU_DATABASE_URL, schema, { cacheKey: 'iedora/menu' })

export const db = handle.db
export type DB = typeof db

/** Round-trip the connection with `SELECT 1`, racing a timeout. */
export const pingDb = handle.ping

/** Graceful pool drain. Call from instrumentation.ts on SIGTERM/SIGINT. */
export const closeDb = handle.close
