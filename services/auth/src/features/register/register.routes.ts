import { Hono } from "hono"
import { z } from "zod"

import { createUser, findUserByEmail, issueTokens } from "../../platform/accounts.ts"
import { type Env, HttpError, reqContext } from "../../platform/http.ts"
import { resolveProvider } from "../../platform/providers/registry.ts"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().max(120).optional(),
})

/** POST /:tenant/register — email + password sign-up. */
export const registerRoutes = new Hono<Env>().post("/register", async (c) => {
  const tenant = c.get("tenant")

  const provider = await resolveProvider(tenant, "password")
  if (!provider || provider.kind !== "password") {
    throw new HttpError(400, "password_disabled", "Password sign-up isn't enabled for this tenant")
  }

  const parsed = schema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) throw new HttpError(422, "invalid_input")
  const { email, password, name } = parsed.data

  if (await findUserByEmail(tenant.id, email)) {
    throw new HttpError(409, "email_taken", "That email is already registered")
  }

  const passwordHash = await provider.hash(password)
  const user = await createUser(tenant, {
    email,
    name,
    providerId: "password",
    subject: email.toLowerCase(),
    passwordHash,
  })

  const tokens = await issueTokens(tenant, user, { amr: ["pwd"], ...reqContext(c) })
  return c.json({ user: { id: user.id, email: user.email, name: user.name }, ...tokens }, 201)
})
