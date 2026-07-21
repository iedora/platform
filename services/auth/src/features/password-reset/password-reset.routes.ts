import { Hono } from "hono"
import { z } from "zod"

import { type Env, validate } from "../../platform/http"
import { requestPasswordReset, resetPassword } from "./password-reset.service"

const forgotSchema = z.object({ email: z.string().email() })
const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
})

/** Public password-reset flow. `forgot-password` always returns 200 so it never
 *  reveals whether an email is registered. */
export const passwordResetRoutes = new Hono<Env>()
  .post("/forgot-password", validate("json", forgotSchema), async (c) => {
    await requestPasswordReset(c.var.tenant, c.req.valid("json").email)
    return c.json({ ok: true })
  })
  .post("/reset-password", validate("json", resetSchema), async (c) => {
    const { token, password } = c.req.valid("json")
    await resetPassword(c.var.tenant, token, password)
    return c.json({ ok: true })
  })
