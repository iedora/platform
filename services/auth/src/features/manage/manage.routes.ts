import { Hono } from "hono"
import { z } from "zod"

import { emitAudit } from "../../platform/audit.ts"
import { db } from "../../platform/db.ts"
import {
  HttpError,
  reqContext,
  type ServiceEnv,
  serviceTenantId,
  validate,
  withService,
} from "../../platform/http.ts"
import type { Tenant } from "../../platform/schema.ts"
import {
  forcePasswordChange,
  getOrganization,
  getUser,
  getUserSessions,
  listAuditEvents,
  listOrganizations,
  listUsers,
  provisionOrganization,
  revokeUserSession,
  setUserBan,
  setUserPassword,
  transferToNewOwner,
} from "./manage.service.ts"

const setPasswordSchema = z.object({ password: z.string().min(8).max(200) })
const banSchema = z.object({
  banned: z.boolean(),
  reason: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
})
const provisionSchema = z.object({
  name: z.string().min(1).max(120),
  ownerUserId: z.string().uuid(),
  slug: z.string().max(64).optional(),
})
const transferSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
})

async function loadTenant(id: string): Promise<Tenant> {
  const t = await db.selectFrom("tenant").selectAll().where("id", "=", id).executeTakeFirst()
  if (!t) throw new HttpError(404, "unknown_tenant")
  return t
}

/** Staff/admin API for backend services (Users CRM + org administration), gated
 *  by a service token and scoped to that client's tenant. */
export const manageRoutes = new Hono<ServiceEnv>()
  .use("/manage/*", withService)
  .get("/manage/users", async (c) => {
    const tid = serviceTenantId(c.var.service)
    return c.json({ users: await listUsers(tid, c.req.query("q") || undefined) })
  })
  .get("/manage/users/:id", async (c) => {
    const user = await getUser(serviceTenantId(c.var.service), c.req.param("id"))
    if (!user) throw new HttpError(404, "unknown_user")
    return c.json(user)
  })
  .get("/manage/users/:id/sessions", async (c) => {
    const tid = serviceTenantId(c.var.service)
    return c.json({ sessions: await getUserSessions(tid, c.req.param("id")) })
  })
  .post("/manage/users/:id/force-password-change", async (c) => {
    const tid = serviceTenantId(c.var.service)
    const userId = c.req.param("id")
    await forcePasswordChange(tid, userId)
    await emitAudit(db, {
      tenantId: tid,
      action: "auth.user.force_password_change",
      actorType: "service",
      actorId: c.var.service.clientId,
      entityType: "user",
      entityId: userId,
      ...reqContext(c),
    })
    return c.json({ ok: true })
  })
  .post("/manage/users/:id/set-password", validate("json", setPasswordSchema), async (c) => {
    const tid = serviceTenantId(c.var.service)
    const userId = c.req.param("id")
    await setUserPassword(tid, userId, c.req.valid("json").password)
    await emitAudit(db, {
      tenantId: tid,
      action: "auth.user.password_set",
      actorType: "service",
      actorId: c.var.service.clientId,
      entityType: "user",
      entityId: userId,
      ...reqContext(c),
    })
    return c.json({ ok: true })
  })
  .post("/manage/users/:id/sessions/:family/revoke", async (c) => {
    const tid = serviceTenantId(c.var.service)
    const userId = c.req.param("id")
    const family = c.req.param("family")
    await revokeUserSession(tid, userId, family)
    await emitAudit(db, {
      tenantId: tid,
      action: "auth.session.revoked",
      actorType: "service",
      actorId: c.var.service.clientId,
      entityType: "user",
      entityId: userId,
      metadata: { family },
      ...reqContext(c),
    })
    return c.json({ ok: true })
  })
  .post("/manage/users/:id/ban", validate("json", banSchema), async (c) => {
    const tid = serviceTenantId(c.var.service)
    const userId = c.req.param("id")
    const ban = c.req.valid("json")
    await setUserBan(tid, userId, ban)
    await emitAudit(db, {
      tenantId: tid,
      action: "auth.user.banned",
      actorType: "service",
      actorId: c.var.service.clientId,
      entityType: "user",
      entityId: userId,
      newData: { banned: ban.banned, reason: ban.reason ?? null, expiresAt: ban.expiresAt ?? null },
      ...reqContext(c),
    })
    return c.json({ ok: true })
  })
  .get("/manage/organizations", async (c) => {
    return c.json({ organizations: await listOrganizations(serviceTenantId(c.var.service)) })
  })
  .get("/manage/organizations/:id", async (c) => {
    const org = await getOrganization(serviceTenantId(c.var.service), c.req.param("id"))
    if (!org) throw new HttpError(404, "unknown_organization")
    return c.json(org)
  })
  .post("/manage/organizations", validate("json", provisionSchema), async (c) => {
    const tenant = await loadTenant(serviceTenantId(c.var.service))
    return c.json(await provisionOrganization(tenant, c.req.valid("json")), 201)
  })
  .post("/manage/organizations/:id/transfer", validate("json", transferSchema), async (c) => {
    const tenant = await loadTenant(serviceTenantId(c.var.service))
    return c.json(await transferToNewOwner(tenant, c.req.param("id"), c.req.valid("json")))
  })
  .get("/manage/audit", async (c) => {
    const events = await listAuditEvents(serviceTenantId(c.var.service), {
      entityType: c.req.query("entityType") || undefined,
      entityId: c.req.query("entityId") || undefined,
      actorId: c.req.query("actorId") || undefined,
      action: c.req.query("action") || undefined,
      limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    })
    return c.json({ events })
  })
