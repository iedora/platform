import { HttpError, isInvalidUUID, isUniqueViolation, onError } from "@iedora/service-kit"
import type { Context } from "hono"

export { isUniqueViolation }

// The tutor error vocabulary, on @iedora/server-kit's HttpError (re-exported by
// service-kit). A foreign id and a missing id both read as 404, never a 500.

/** 404 — entity absent within the caller's scope (or a malformed id). */
export const notFound = (): HttpError => new HttpError(404, "not_found", "not found")

/** 403 — the caller may not act on this resource. */
export const forbidden = (): HttpError => new HttpError(403, "forbidden", "forbidden")

/** 409 — a conflicting/illegal state transition. */
export const conflict = (message: string): HttpError => new HttpError(409, "conflict", message)

/** 422 — user-correctable input problem. */
export const invalid = (message: string): HttpError => new HttpError(422, "invalid", message)

// Reuse server-kit's onError (shapes HttpError → { error, message }, logs anything
// else as a 500). The one product extension: a malformed value Postgres rejects
// surfaces as 404, same as a missing row.
export function handleError(err: Error, c: Context): Response {
  if (isInvalidUUID(err)) return c.json({ error: "not_found" }, 404)
  return onError(err, c)
}
