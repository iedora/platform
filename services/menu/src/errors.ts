import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

// The menu error vocabulary — the single response chokepoint. A foreign id and
// a missing id look identical (both 404), never a 500.

/** 404 — entity absent within the caller's scope (or a malformed id). */
export const notFound = (): HTTPException => new HTTPException(404, { message: "not found" });

/** 409 — restaurant slug already in use. */
export const slugTaken = (): HTTPException => new HTTPException(409, { message: "slug taken" });

/** 422 — user-correctable input problem. */
export const invalid = (message: string): HTTPException => new HTTPException(422, { message });

// 429 — rate-limit deny, carrying Retry-After. A subclass so the centralized
// onError renders it (with its header) like any other HTTPException.
export class RateLimitError extends HTTPException {
  constructor(retryAfterSeconds: number) {
    const res = new Response(JSON.stringify({ error: "rate limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
    });
    super(429, { res, message: "rate limited" });
  }
}

/** Bun's PostgresError carries the SQLSTATE in `errno`. */
function sqlState(err: unknown): string | undefined {
  const e = (err as { errno?: unknown } | null)?.errno;
  return typeof e === "string" ? e : undefined;
}

/** A malformed id reaching a uuid column (22P02) → indistinguishable from missing. */
export function isInvalidUUID(err: unknown): boolean {
  return sqlState(err) === "22P02";
}

export function isUniqueViolation(err: unknown): boolean {
  return sqlState(err) === "23505";
}

// onErrorBody is the menu services' shared error handler: HTTPException renders
// itself; a malformed-uuid surfaces as 404 (same as missing); anything else is
// a logged 500. This mapping covers the cases the store raises
// as raw Postgres errors rather than domain errors.
export function handleError(err: Error, c: Context): Response {
  if (err instanceof HTTPException) return err.getResponse();
  if (isInvalidUUID(err)) return c.json({ error: "not found" }, 404);
  console.error(JSON.stringify({ level: "error", msg: "unhandled error", err: String(err) }));
  return c.json({ error: "internal error" }, 500);
}
