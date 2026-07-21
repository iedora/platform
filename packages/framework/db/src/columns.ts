import type { ColumnType } from "kysely"

/** A DB-defaulted, never-updated timestamp (e.g. `created_at`): read as a Date,
 *  optional on insert, not updatable. */
export type Created = ColumnType<Date, Date | string | undefined, never>

/** A read/write timestamp: read as a Date, write a Date or ISO string. */
export type Timestamp = ColumnType<Date, Date | string, Date | string>
