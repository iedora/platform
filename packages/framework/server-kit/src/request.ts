import type { Context } from "hono"

/** Client IP + user-agent for audit/logging. Behind a proxy or tunnel the real
 *  client IP is the first `x-forwarded-for` hop. */
export function reqContext(c: Context): { ip: string | null; userAgent: string | null } {
  const fwd = c.req.header("x-forwarded-for")
  return {
    ip: fwd ? (fwd.split(",")[0]?.trim() ?? null) : null,
    userAgent: c.req.header("user-agent") ?? null,
  }
}

/** The bearer token from the Authorization header, or undefined. */
export function readBearer(c: Context): string | undefined {
  const header = c.req.header("authorization")
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined
}
