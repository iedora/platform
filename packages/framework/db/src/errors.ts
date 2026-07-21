// SQLSTATE detection for Postgres errors from Bun's SQL driver, which carries the
// SQLSTATE in `errno` (its `code` is the generic ERR_POSTGRES_SERVER_ERROR). One
// home so turning a raw store error into a domain error can't drift per service.

/** The SQLSTATE of a Postgres error, or undefined if it isn't one. */
export function sqlState(err: unknown): string | undefined {
  const e = (err as { errno?: unknown } | null)?.errno
  return typeof e === "string" ? e : undefined
}

/** 23505 — unique violation (duplicate key, e.g. email / slug). */
export function isUniqueViolation(err: unknown): boolean {
  return sqlState(err) === "23505"
}

/** 23503 — foreign-key violation. */
export function isForeignKeyViolation(err: unknown): boolean {
  return sqlState(err) === "23503"
}

/** 23514 — check-constraint violation. */
export function isCheckViolation(err: unknown): boolean {
  return sqlState(err) === "23514"
}

/** 22P02 — invalid text representation (e.g. a malformed uuid reaching a uuid
 *  column); indistinguishable from "not found". */
export function isInvalidText(err: unknown): boolean {
  return sqlState(err) === "22P02"
}
