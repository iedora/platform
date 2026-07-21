import { Hono } from "hono"

import { findUserById } from "../../platform/accounts"
import { type AuthedEnv, HttpError, withUser } from "../../platform/http"

/** GET /:tenant/whoami — the verified caller, with a LIVE `mustChangePassword`
 *  read (a forced-change set after the token was minted still takes effect).
 *  Consumers should normally verify tokens themselves via JWKS; this is for
 *  quick checks and the forced-change gate. */
export const whoamiRoutes = new Hono<AuthedEnv>().use("*", withUser).get("/whoami", async (c) => {
  const { sub, org, roles, exp } = c.var.authUser
  const user = await findUserById(c.var.tenant.id, sub)
  if (!user) throw new HttpError(404, "unknown_user")

  return c.json({
    sub: user.id,
    email: user.email,
    name: user.name,
    tenant: c.var.tenant.slug,
    org,
    roles,
    mustChangePassword: user.mustChangePassword,
    exp,
  })
})
