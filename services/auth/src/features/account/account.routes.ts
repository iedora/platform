import { Hono } from "hono"
import { z } from "zod"

import { emitAudit } from "../../platform/audit.ts"
import { db } from "../../platform/db.ts"
import { type AuthedEnv, reqContext, validate, withUser } from "../../platform/http.ts"
import {
  changePassword,
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from "./account.service.ts"

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword: z.string().min(8).max(200),
})

/** Authenticated self-service: password + device/session management. Every route
 *  runs behind `withUser`, so `c.var.authUser` is the verified caller. */
export const accountRoutes = new Hono<AuthedEnv>()
  .use("*", withUser)
  .post("/change-password", validate("json", changePasswordSchema), async (c) => {
    const { sub, sid } = c.var.authUser
    await changePassword(c.var.tenant.id, sub, c.req.valid("json"), sid)
    return c.json({ ok: true })
  })
  .get("/sessions", async (c) => {
    const { sub, sid } = c.var.authUser
    return c.json({ sessions: await listSessions(c.var.tenant.id, sub, sid) })
  })
  .post("/sessions/revoke-others", async (c) => {
    const { sub, sid } = c.var.authUser
    await revokeOtherSessions(c.var.tenant.id, sub, sid)
    await emitAudit(db, {
      tenantId: c.var.tenant.id,
      action: "auth.session.revoked",
      actorType: "user",
      actorId: sub,
      entityType: "session",
      entityId: null,
      metadata: { scope: "others", keptFamily: sid },
      ...reqContext(c),
    })
    return c.json({ ok: true })
  })
  .post("/sessions/:family/revoke", async (c) => {
    const { sub } = c.var.authUser
    const family = c.req.param("family")
    await revokeSession(c.var.tenant.id, sub, family)
    await emitAudit(db, {
      tenantId: c.var.tenant.id,
      action: "auth.session.revoked",
      actorType: "user",
      actorId: sub,
      entityType: "session",
      entityId: family,
      ...reqContext(c),
    })
    return c.json({ ok: true })
  })
