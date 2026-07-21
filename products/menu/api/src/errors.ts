import { HttpError, isInvalidUUID, isUniqueViolation, onError, trace } from "@iedora/service-runtime";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

// SQLSTATE detectors live in server-kit (shared across services); re-exported so
// the menu data layer keeps importing them from the error vocabulary.
export { isInvalidUUID, isUniqueViolation };

// The menu error vocabulary — the single response chokepoint. Domain errors are
// the SHARED @iedora/server-kit `HttpError` (not a parallel Hono HTTPException
// set), so every service shapes errors the same way. A foreign id and a missing
// id look identical (both 404), never a 500.

/** 404 — entity absent within the caller's scope (or a malformed id). */
export const notFound = (): HttpError => new HttpError(404, "not_found", "not found");

/** 409 — restaurant slug already in use. */
export const slugTaken = (): HttpError => new HttpError(409, "slug_taken", "slug taken");

/** 422 — user-correctable input problem. */
export const invalid = (message: string): HttpError => new HttpError(422, "invalid", message);

// 429 — rate-limit deny, carrying Retry-After. Stays a Hono HTTPException because
// HttpError can't carry a custom header/Response; handleError renders it via
// getResponse() below.
export class RateLimitError extends HTTPException {
  constructor(retryAfterSeconds: number) {
    const res = new Response(JSON.stringify({ error: "rate limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
    });
    super(429, { res, message: "rate limited" });
  }
}

// handleError is a thin adapter over the shared runtime, adding only the two
// things the generic onError can't infer: a rate-limit HTTPException (its custom
// Retry-After Response) and a malformed-uuid → 404 (a raw Postgres error, not a
// domain throw). Domain HttpErrors delegate their shaping to server-kit's shared
// `onError`; a genuinely-unexpected error keeps menu's trace-correlated 500 log.
export function handleError(err: Error, c: Context): Response {
  if (err instanceof HTTPException) return err.getResponse();
  if (isInvalidUUID(err)) return c.json({ error: "not_found" }, 404);
  if (err instanceof HttpError) return onError(err, c) as Response;
  const sc = trace.getActiveSpan()?.spanContext();
  console.error(
    JSON.stringify({
      level: "error",
      msg: "unhandled error",
      err: String(err),
      ...(sc ? { trace_id: sc.traceId, span_id: sc.spanId } : {}),
    }),
  );
  return c.json({ error: "internal error" }, 500);
}
