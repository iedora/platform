// SQLSTATE detection for Postgres errors raised by Bun's SQL driver. Bun's
// PostgresError carries the SQLSTATE in `errno` (its `code` is the generic
// ERR_POSTGRES_SERVER_ERROR), so every service that turns a raw store error
// into a domain error needs this — keep that quirk in one place.

/** The SQLSTATE of a Postgres error, or undefined if it isn't one. */
export function sqlState(err: unknown): string | undefined {
  const e = (err as { errno?: unknown } | null)?.errno;
  return typeof e === "string" ? e : undefined;
}

/** 23505 — unique-violation (e.g. duplicate email / slug). */
export function isUniqueViolation(err: unknown): boolean {
  return sqlState(err) === "23505";
}

/** 22P02 — a malformed id reaching a uuid column; indistinguishable from missing. */
export function isInvalidUUID(err: unknown): boolean {
  return sqlState(err) === "22P02";
}
