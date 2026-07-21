import type { AuditRecord } from "@iedora/sdk/audit"

import { queryAudit } from "../../platform/audit.ts"
import {
  burnFamily,
  createUser,
  findUserByEmail,
  findUserById,
  foldSessionFamilies,
  revokeAllUserSessions,
  writePassword,
} from "../../platform/accounts.ts"
import { emitAudit } from "../../platform/audit.ts"
import { db } from "../../platform/db.ts"
import { HttpError } from "../../platform/http.ts"
import { passwordProvider } from "../../platform/providers/password.ts"
import type { Tenant } from "../../platform/schema.ts"
import { createOrganization } from "../organizations/organizations.service.ts"

/* --------------------------------- users --------------------------------- */

export type AdminUser = {
  id: string
  email: string
  name: string | null
  banned: boolean
  mustChangePassword: boolean
  emailVerified: boolean
  createdAt: string
  orgCount: number
}

/** Search/list users in the tenant (email substring), with their org count. */
export async function listUsers(tenantId: string, q?: string): Promise<AdminUser[]> {
  let query = db
    .selectFrom("user")
    .select(["id", "email", "name", "banned", "mustChangePassword", "emailVerified", "createdAt"])
    .where("tenantId", "=", tenantId)
  if (q) query = query.where("email", "ilike", `%${q}%`)
  const users = await query.orderBy("createdAt", "desc").limit(200).execute()

  const counts = await db
    .selectFrom("membership")
    .select(["userId", db.fn.count<number>("id").as("n")])
    .where("tenantId", "=", tenantId)
    .groupBy("userId")
    .execute()
  const byUser = new Map(counts.map((c) => [c.userId, Number(c.n)]))

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    banned: u.banned,
    mustChangePassword: u.mustChangePassword,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
    orgCount: byUser.get(u.id) ?? 0,
  }))
}

export type AdminUserDetail = AdminUser & {
  memberships: { organizationId: string; slug: string; name: string; role: string }[]
}

export async function getUser(tenantId: string, userId: string): Promise<AdminUserDetail | null> {
  const u = await db
    .selectFrom("user")
    .select(["id", "email", "name", "banned", "mustChangePassword", "emailVerified", "createdAt"])
    .where("tenantId", "=", tenantId)
    .where("id", "=", userId)
    .executeTakeFirst()
  if (!u) return null

  const memberships = await db
    .selectFrom("membership as m")
    .innerJoin("organization as o", "o.id", "m.organizationId")
    .select(["o.id as organizationId", "o.slug as slug", "o.name as name", "m.role as role"])
    .where("m.tenantId", "=", tenantId)
    .where("m.userId", "=", userId)
    .execute()

  return {
    id: u.id,
    email: u.email,
    name: u.name,
    banned: u.banned,
    mustChangePassword: u.mustChangePassword,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
    orgCount: memberships.length,
    memberships,
  }
}

export type AdminSession = {
  family: string
  ip: string | null
  userAgent: string | null
  createdAt: string
  lastActiveAt: string
  expiresAt: string
  revoked: boolean
}

/** A user's session/device history (all families, including revoked). */
export async function getUserSessions(tenantId: string, userId: string): Promise<AdminSession[]> {
  const rows = await db
    .selectFrom("session")
    .selectAll()
    .where("tenantId", "=", tenantId)
    .where("userId", "=", userId)
    .orderBy("createdAt", "asc")
    .execute()
  return foldSessionFamilies(rows).map((f) => ({
    family: f.family,
    ip: f.last.ip,
    userAgent: f.last.userAgent,
    createdAt: f.first.createdAt.toISOString(),
    lastActiveAt: f.last.createdAt.toISOString(),
    expiresAt: f.last.expiresAt.toISOString(),
    revoked: f.links.every((l) => l.revokedAt !== null),
  }))
}

async function requireUser(tenantId: string, userId: string): Promise<void> {
  if (!(await findUserById(tenantId, userId))) throw new HttpError(404, "unknown_user")
}

/** Flag a forced password change and sign the user out everywhere. */
export async function forcePasswordChange(tenantId: string, userId: string): Promise<void> {
  await requireUser(tenantId, userId)
  await db.updateTable("user").set({ mustChangePassword: true }).where("id", "=", userId).execute()
  await revokeAllUserSessions(db, tenantId, userId)
}

/** Set a temporary password (forces a change) and sign the user out everywhere.
 *  Creates the password identity if the user had none. */
export async function setUserPassword(
  tenantId: string,
  userId: string,
  password: string,
): Promise<void> {
  const user = await findUserById(tenantId, userId)
  if (!user) throw new HttpError(404, "unknown_user")
  const hash = await passwordProvider.hash(password)

  await db.transaction().execute(async (trx) => {
    await writePassword(trx, { tenantId, userId, email: user.email, hash, forceChange: true })
    await revokeAllUserSessions(trx, tenantId, userId)
  })
}

/** Revoke one device (family) of a user. */
export async function revokeUserSession(
  tenantId: string,
  userId: string,
  family: string,
): Promise<void> {
  const owned = await db
    .selectFrom("session")
    .select("id")
    .where("tenantId", "=", tenantId)
    .where("userId", "=", userId)
    .where("familyId", "=", family)
    .executeTakeFirst()
  if (!owned) throw new HttpError(404, "unknown_session")
  await burnFamily(tenantId, family)
}

/** Ban (suspend) or unban a user. Banning signs them out everywhere. */
export async function setUserBan(
  tenantId: string,
  userId: string,
  ban: { banned: boolean; reason?: string | null; expiresAt?: string | null },
): Promise<void> {
  await requireUser(tenantId, userId)
  await db
    .updateTable("user")
    .set({
      banned: ban.banned,
      banReason: ban.banned ? (ban.reason ?? null) : null,
      banExpiresAt: ban.banned && ban.expiresAt ? new Date(ban.expiresAt) : null,
    })
    .where("id", "=", userId)
    .execute()
  if (ban.banned) await revokeAllUserSessions(db, tenantId, userId)
}

/* ------------------------------ organizations ---------------------------- */

export type OrgWithOwner = {
  id: string
  slug: string
  name: string
  createdAt: string
  owner: { id: string; email: string; name: string | null } | null
}

async function ownersFor(
  tenantId: string,
  orgIds: string[],
): Promise<Map<string, { id: string; email: string; name: string | null }>> {
  if (orgIds.length === 0) return new Map()
  const rows = await db
    .selectFrom("membership as m")
    .innerJoin("user as u", "u.id", "m.userId")
    .select(["m.organizationId as orgId", "u.id as id", "u.email as email", "u.name as name"])
    .where("m.tenantId", "=", tenantId)
    .where("m.organizationId", "in", orgIds)
    .where("m.role", "=", "owner")
    .orderBy("m.createdAt", "asc")
    .execute()
  const map = new Map<string, { id: string; email: string; name: string | null }>()
  for (const r of rows) {
    if (!map.has(r.orgId)) map.set(r.orgId, { id: r.id, email: r.email, name: r.name })
  }
  return map
}

export async function listOrganizations(tenantId: string): Promise<OrgWithOwner[]> {
  const orgs = await db
    .selectFrom("organization")
    .select(["id", "slug", "name", "createdAt"])
    .where("tenantId", "=", tenantId)
    .orderBy("name", "asc")
    .execute()
  const owners = await ownersFor(
    tenantId,
    orgs.map((o) => o.id),
  )
  return orgs.map((o) => ({
    id: o.id,
    slug: o.slug,
    name: o.name,
    createdAt: o.createdAt.toISOString(),
    owner: owners.get(o.id) ?? null,
  }))
}

export async function getOrganization(tenantId: string, orgId: string): Promise<OrgWithOwner | null> {
  const o = await db
    .selectFrom("organization")
    .select(["id", "slug", "name", "createdAt"])
    .where("tenantId", "=", tenantId)
    .where("id", "=", orgId)
    .executeTakeFirst()
  if (!o) return null
  const owners = await ownersFor(tenantId, [o.id])
  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    createdAt: o.createdAt.toISOString(),
    owner: owners.get(o.id) ?? null,
  }
}

/** Provision an org owned by an existing user (staff action). */
export async function provisionOrganization(
  tenant: Tenant,
  input: { name: string; ownerUserId: string; slug?: string },
): Promise<{ id: string; slug: string; name: string }> {
  const owner = await db
    .selectFrom("user")
    .select("id")
    .where("tenantId", "=", tenant.id)
    .where("id", "=", input.ownerUserId)
    .executeTakeFirst()
  if (!owner) throw new HttpError(404, "unknown_user", "Owner user not found in this tenant")
  const org = await createOrganization(tenant, input.ownerUserId, { name: input.name, slug: input.slug })
  return { id: org.id, slug: org.slug, name: org.name }
}

/** Transfer an org to a brand-new user: create the user, make them owner, demote
 *  prior owners to admin, and emit an event so products can move their own data. */
export async function transferToNewOwner(
  tenant: Tenant,
  orgId: string,
  input: { email: string; name: string; password: string },
): Promise<{ ownerId: string }> {
  const org = await db
    .selectFrom("organization")
    .select("id")
    .where("tenantId", "=", tenant.id)
    .where("id", "=", orgId)
    .executeTakeFirst()
  if (!org) throw new HttpError(404, "unknown_organization")
  if (await findUserByEmail(tenant.id, input.email)) {
    throw new HttpError(409, "email_taken", "That email already has an account")
  }

  // Capture the prior owner so the audit event carries before/after state.
  const prevOwner = await db
    .selectFrom("membership")
    .select("userId")
    .where("tenantId", "=", tenant.id)
    .where("organizationId", "=", orgId)
    .where("role", "=", "owner")
    .orderBy("createdAt", "asc")
    .executeTakeFirst()

  const passwordHash = await passwordProvider.hash(input.password)
  const newOwner = await createUser(tenant, {
    email: input.email,
    name: input.name,
    providerId: "password",
    subject: input.email.toLowerCase(),
    passwordHash,
  })

  await db.transaction().execute(async (trx) => {
    // Demote current owners, then install the new one.
    await trx
      .updateTable("membership")
      .set({ role: "admin" })
      .where("tenantId", "=", tenant.id)
      .where("organizationId", "=", orgId)
      .where("role", "=", "owner")
      .execute()
    await trx
      .insertInto("membership")
      .values({ tenantId: tenant.id, organizationId: orgId, userId: newOwner.id, role: "owner" })
      .onConflict((oc) => oc.columns(["organizationId", "userId"]).doUpdateSet({ role: "owner" }))
      .execute()
    await emitAudit(trx, {
      tenantId: tenant.id,
      action: "auth.org.owner_transferred",
      actorType: "service",
      entityType: "organization",
      entityId: orgId,
      oldData: { ownerId: prevOwner?.userId ?? null },
      newData: { ownerId: newOwner.id },
      metadata: { newOwnerEmail: newOwner.email },
    })
  })

  return { ownerId: newOwner.id }
}

/* --------------------------------- audit --------------------------------- */

export type AuditQueryInput = {
  entityType?: string
  entityId?: string
  actorId?: string
  action?: string
  limit?: number
}

/** Read the tenant's audit log (newest first) through the audit service. The
 *  service filters by target (= entity id); entity_type is not a server-side
 *  filter, so `entityType` is accepted for API compatibility but not sent. */
export function listAuditEvents(tenantId: string, f: AuditQueryInput): Promise<AuditRecord[]> {
  return queryAudit({
    tenant: tenantId,
    actor: f.actorId,
    action: f.action,
    target: f.entityId,
    limit: f.limit,
  })
}
