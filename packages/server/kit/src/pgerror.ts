// SQLSTATE detection for Bun SQL's PostgresError (SQLSTATE in `errno`), sourced
// from @iedora/db so the Bun-driver quirk lives in one published package.
import { isInvalidText } from "@iedora/db";

export { isUniqueViolation, sqlState } from "@iedora/db";

/** 22P02 — a malformed id reaching a uuid column; indistinguishable from missing.
 *  Named alias of @iedora/db's generic `isInvalidText` (22P02 covers any invalid
 *  text representation). */
export const isInvalidUUID = isInvalidText;
