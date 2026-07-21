import { Hono } from "hono"
import { z } from "zod"

import { revokeRefresh } from "../../platform/accounts"
import { type Env, HttpError } from "../../platform/http"

const schema = z.object({ refreshToken: z.string().min(1) })

/** POST /:tenant/logout — revoke a refresh session. Access tokens expire on their
 *  own (short TTL); this stops the session from being refreshed. */
export const logoutRoutes = new Hono<Env>().post("/logout", async (c) => {
  const tenant = c.get("tenant")
  const parsed = schema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) throw new HttpError(422, "invalid_input")

  await revokeRefresh(tenant, parsed.data.refreshToken)
  return c.json({ ok: true })
})
