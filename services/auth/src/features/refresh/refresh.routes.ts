import { Hono } from "hono"
import { z } from "zod"

import { rotateRefresh } from "../../platform/accounts"
import { type Env, HttpError, reqContext } from "../../platform/http"

const schema = z.object({ refreshToken: z.string().min(1) })

/** POST /:tenant/refresh — exchange a refresh token for a new bundle (rotation). */
export const refreshRoutes = new Hono<Env>().post("/refresh", async (c) => {
  const tenant = c.get("tenant")
  const parsed = schema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) throw new HttpError(422, "invalid_input")

  const bundle = await rotateRefresh(tenant, parsed.data.refreshToken, reqContext(c))
  if (!bundle) throw new HttpError(401, "invalid_grant", "Refresh token is invalid or expired")
  return c.json(bundle)
})
