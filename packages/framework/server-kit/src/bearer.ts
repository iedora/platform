import type { Env } from "hono"
import { createMiddleware } from "hono/factory"

/**
 * A TYPED bearer gate: parse `Authorization: Bearer …`, 401 (JSON) on missing,
 * run `verify`, set the resolved principal under `setKey`, 401 on a verify throw.
 * Distinct from {@link bearerAuth} (which throws an HttpError and uses a string
 * key) — this one types the Variables slot and never lets the two auth gates
 * drift in their 401 handling. Used by serviceAuth + userAuth.
 */
export function typedBearer<
  E extends Env,
  K extends keyof E["Variables"] & string = keyof E["Variables"] & string,
>(opts: {
  verify: (token: string) => Promise<E["Variables"][K]>
  setKey: K
  invalidMsg: string
}) {
  return createMiddleware<E>(async (c, next) => {
    const header = c.req.header("authorization") ?? ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : ""
    if (!token) return c.json({ error: "missing bearer token" }, 401)
    try {
      c.set(opts.setKey, await opts.verify(token))
    } catch {
      return c.json({ error: opts.invalidMsg }, 401)
    }
    await next()
  })
}
