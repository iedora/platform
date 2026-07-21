import { createDb } from "@iedora/db"

import { config } from "./config"
import type { DB } from "./schema"

/** snake_case columns in Postgres <-> camelCase in TS via CamelCasePlugin. */
export const db = createDb<DB>(config.databaseUrl, { poolMax: 10 })
