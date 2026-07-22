import { Hono } from "hono"
import { z } from "zod"

import { findUserById } from "../../platform/accounts.ts"
import { emitAudit } from "../../platform/audit.ts"
import { db } from "../../platform/db.ts"
import { type AuthedEnv, HttpError, reqContext, validate, withUser } from "../../platform/http.ts"
import {
  addMember,
  createOrganization,
  listMembers,
  listMyOrganizations,
  removeMember,
  requireOrgRole,
  switchOrganization,
  updateMemberRole,
} from "./organizations.service.ts"

const roleEnum = z.enum(["owner", "admin", "member"])
const createSchema = z.object({ name: z.string().min(1).max(120), slug: z.string().max(64).optional() })
const addMemberSchema = z.object({ email: z.string().email(), role: roleEnum.optional() })
const updateRoleSchema = z.object({ role: roleEnum })

/** Organizations + memberships. Everything runs behind `withUser`; management
 *  routes further require owner/admin in the target org. */
export const organizationRoutes = new Hono<AuthedEnv>()
  .use("*", withUser)
  .post("/organizations", validate("json", createSchema), async (c) => {
    const org = await createOrganization(c.var.tenant, c.var.authUser.sub, c.req.valid("json"))
    return c.json(org, 201)
  })
  .get("/organizations", async (c) => {
    const orgs = await listMyOrganizations(c.var.tenant.id, c.var.authUser.sub)
    return c.json({ organizations: orgs })
  })
  .post("/organizations/:org/switch", async (c) => {
    const { sub, sid } = c.var.authUser
    const user = await findUserById(c.var.tenant.id, sub)
    if (!user) throw new HttpError(404, "unknown_user")
    return c.json(await switchOrganization(c.var.tenant, user, sid, c.req.param("org")))
  })
  .get("/organizations/:org/members", async (c) => {
    const org = c.req.param("org")
    await requireOrgRole(c.var.tenant.id, c.var.authUser.sub, org, ["owner", "admin", "member"])
    return c.json({ members: await listMembers(c.var.tenant.id, org) })
  })
  .post("/organizations/:org/members", validate("json", addMemberSchema), async (c) => {
    const org = c.req.param("org")
    await requireOrgRole(c.var.tenant.id, c.var.authUser.sub, org, ["owner", "admin"])
    const { email, role } = c.req.valid("json")
    const member = await addMember(c.var.tenant.id, org, email, role ?? "member")
    await emitAudit(db, {
      tenantId: c.var.tenant.id,
      action: "auth.org.member_added",
      actorType: "user",
      actorId: c.var.authUser.sub,
      entityType: "organization",
      entityId: org,
      metadata: { memberUserId: member.userId, role: member.role },
      ...reqContext(c),
    })
    return c.json(member, 201)
  })
  .patch("/organizations/:org/members/:userId", validate("json", updateRoleSchema), async (c) => {
    const org = c.req.param("org")
    const callerRole = await requireOrgRole(c.var.tenant.id, c.var.authUser.sub, org, ["owner", "admin"])
    await updateMemberRole(c.var.tenant.id, org, callerRole, c.req.param("userId"), c.req.valid("json").role)
    return c.json({ ok: true })
  })
  .delete("/organizations/:org/members/:userId", async (c) => {
    const org = c.req.param("org")
    await requireOrgRole(c.var.tenant.id, c.var.authUser.sub, org, ["owner", "admin"])
    const memberUserId = c.req.param("userId")
    await removeMember(c.var.tenant.id, org, memberUserId)
    await emitAudit(db, {
      tenantId: c.var.tenant.id,
      action: "auth.org.member_removed",
      actorType: "user",
      actorId: c.var.authUser.sub,
      entityType: "organization",
      entityId: org,
      metadata: { memberUserId },
      ...reqContext(c),
    })
    return c.json({ ok: true })
  })
