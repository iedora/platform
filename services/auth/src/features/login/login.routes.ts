import { Hono } from "hono"
import { z } from "zod"

import { findIdentity, findUserByEmail, issueTokens } from "../../platform/accounts"
import { type Env, HttpError, reqContext } from "../../platform/http"
import { listEnabledProviders, resolveProvider } from "../../platform/providers/registry"

const schema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
})

export const loginRoutes = new Hono<Env>()
  // GET /:tenant/providers — the sign-in options a UI should render.
  .get("/providers", async (c) => {
    const tenant = c.get("tenant")
    return c.json({ providers: await listEnabledProviders(tenant.id) })
  })
  // POST /:tenant/login — email + password.
  .post("/login", async (c) => {
    const tenant = c.get("tenant")

    const provider = await resolveProvider(tenant, "password")
    if (!provider || provider.kind !== "password") {
      throw new HttpError(400, "password_disabled", "Password sign-in isn't enabled for this tenant")
    }

    const parsed = schema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HttpError(422, "invalid_input")
    const { email, password } = parsed.data

    // Same generic error whether the user or the password is wrong.
    const invalid = new HttpError(401, "invalid_credentials", "Wrong email or password")
    const user = await findUserByEmail(tenant.id, email)
    if (!user) throw invalid
    const identity = await findIdentity(tenant.id, "password", email.toLowerCase())
    if (!identity?.passwordHash) throw invalid
    if (!(await provider.verify(password, identity.passwordHash))) throw invalid

    const tokens = await issueTokens(tenant, user, { amr: ["pwd"], ...reqContext(c) })
    return c.json({ user: { id: user.id, email: user.email, name: user.name }, ...tokens })
  })
