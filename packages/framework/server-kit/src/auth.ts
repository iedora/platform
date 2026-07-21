import type { Context, MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"

import { HttpError } from "./errors.ts"
import { readBearer } from "./request.ts"

/**
 * A bearer-token middleware: pull the token, 401 if missing, run `verify`, and
 * store the result under `contextKey` (default `"auth"`) so handlers read it via
 * `c.get(contextKey)`. `verify` throws an HttpError to reject (e.g. bad token,
 * wrong audience). Services that want a strongly-typed caller can instead read
 * the token with `readBearer` and set their own typed context variable.
 *
 * ```ts
 * app.use("/api/*", bearerAuth((token) => verifyJwt(token)))
 * app.get("/api/me", (c) => c.json(c.get("auth")))
 * ```
 */
export function bearerAuth<T>(
  verify: (token: string, c: Context) => T | Promise<T>,
  contextKey = "auth",
): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const token = readBearer(c)
    if (!token) throw new HttpError(401, "missing_token")
    c.set(contextKey, await verify(token, c))
    await next()
  })
}
