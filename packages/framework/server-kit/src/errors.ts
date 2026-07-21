import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"

/** Throw from a handler/middleware to return a clean JSON error with a status.
 *  `code` is a stable machine string; `message` is human-readable. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
    this.name = "HttpError"
  }
}

/** App `onError`: shape HttpError as `{ error, message }`, and anything else as a
 *  logged 500. Register with `app.onError(onError)`. */
export function onError(err: Error, c: Context) {
  if (err instanceof HttpError) {
    return c.json({ error: err.code, message: err.message }, err.status as ContentfulStatusCode)
  }
  console.error("[server-kit] unhandled error:", err)
  return c.json({ error: "internal_error" }, 500)
}
