import { db } from "../../platform/db.ts"
import { HttpError } from "../../platform/http.ts"
import type { Organization, Tenant, User } from "../../platform/schema.ts"
import { signAccessToken } from "../../platform/tokens.ts"

/** Generic org roles, most-privileged first. Products can layer their own
 *  meaning on top, but owner/admin gate membership management here. */
export const ROLES = ["owner", "admin", "member"] as const
export type Role = (typeof ROLES)[number]
const RANK: Record<string, number> = { owner: 3, admin: 2, member: 1 }

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "org"
  )
}

/** The caller's role in an org, or null when they're not a member. */
export async function membershipRole(
  tenantId: string,
  userId: string,
  orgId: string,
): Promise<Role | null> {
  const m = await db
    .selectFrom("membership")
    .select("role")
    .where("tenantId", "=", tenantId)
    .where("organizationId", "=", orgId)
    .where("userId", "=", userId)
    .executeTakeFirst()
  return (m?.role as Role) ?? null
}

/** Throw unless the caller holds at least one of `allowed` in the org. */
export async function requireOrgRole(
  tenantId: string,
  userId: string,
  orgId: string,
  allowed: Role[],
): Promise<Role> {
  const role = await membershipRole(tenantId, userId, orgId)
  if (!role || !allowed.includes(role)) throw new HttpError(403, "forbidden")
  return role
}

/** Create an org (unique slug per tenant) and make the caller its owner. */
export async function createOrganization(
  tenant: Tenant,
  ownerUserId: string,
  input: { name: string; slug?: string },
): Promise<Organization> {
  const base = input.slug ? slugify(input.slug) : slugify(input.name)
  return db.transaction().execute(async (trx) => {
    // Resolve a slug collision within the tenant by suffixing -2, -3, …
    let slug = base
    for (let n = 2; ; n++) {
      const clash = await trx
        .selectFrom("organization")
        .select("id")
        .where("tenantId", "=", tenant.id)
        .where("slug", "=", slug)
        .executeTakeFirst()
      if (!clash) break
      slug = `${base}-${n}`
    }
    const org = await trx
      .insertInto("organization")
      .values({ tenantId: tenant.id, slug, name: input.name })
      .returningAll()
      .executeTakeFirstOrThrow()
    await trx
      .insertInto("membership")
      .values({ tenantId: tenant.id, organizationId: org.id, userId: ownerUserId, role: "owner" })
      .execute()
    return org
  })
}

export type MyOrg = { id: string; slug: string; name: string; role: Role }

/** The caller's organizations with their role in each. */
export async function listMyOrganizations(tenantId: string, userId: string): Promise<MyOrg[]> {
  const rows = await db
    .selectFrom("membership as m")
    .innerJoin("organization as o", "o.id", "m.organizationId")
    .select(["o.id as id", "o.slug as slug", "o.name as name", "m.role as role"])
    .where("m.tenantId", "=", tenantId)
    .where("m.userId", "=", userId)
    .orderBy("o.name", "asc")
    .execute()
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, role: r.role as Role }))
}

/** Set the caller's active org for their session family and mint a fresh access
 *  token carrying the new org + roles. Refresh token is unchanged; the choice is
 *  persisted on the family so it survives rotation. */
export async function switchOrganization(
  tenant: Tenant,
  user: User,
  familyId: string,
  orgId: string,
): Promise<{ accessToken: string; expiresIn: number; org: string; roles: Role[] }> {
  const role = await membershipRole(tenant.id, user.id, orgId)
  if (!role) throw new HttpError(403, "not_a_member")

  await db
    .updateTable("session")
    .set({ activeOrganizationId: orgId })
    .where("tenantId", "=", tenant.id)
    .where("familyId", "=", familyId)
    .execute()

  const { token, expiresIn } = await signAccessToken(tenant, user, {
    sid: familyId,
    org: orgId,
    roles: [role],
  })
  return { accessToken: token, expiresIn, org: orgId, roles: [role] }
}

export type Member = {
  userId: string
  email: string
  name: string | null
  role: Role
  joinedAt: string
}

/** Members of an org (caller must belong to it — enforced by the route). */
export async function listMembers(tenantId: string, orgId: string): Promise<Member[]> {
  const rows = await db
    .selectFrom("membership as m")
    .innerJoin("user as u", "u.id", "m.userId")
    .select(["u.id as userId", "u.email as email", "u.name as name", "m.role as role", "m.createdAt as joinedAt"])
    .where("m.tenantId", "=", tenantId)
    .where("m.organizationId", "=", orgId)
    .orderBy("m.createdAt", "asc")
    .execute()
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    name: r.name,
    role: r.role as Role,
    joinedAt: r.joinedAt.toISOString(),
  }))
}

/** Add an existing tenant user to an org by email. */
export async function addMember(
  tenantId: string,
  orgId: string,
  email: string,
  role: Role,
): Promise<Member> {
  const user = await db
    .selectFrom("user")
    .select(["id", "email", "name"])
    .where("tenantId", "=", tenantId)
    .where("email", "=", email.toLowerCase())
    .executeTakeFirst()
  if (!user) throw new HttpError(404, "unknown_user", "No user with that email in this tenant")

  const existing = await membershipRole(tenantId, user.id, orgId)
  if (existing) throw new HttpError(409, "already_member")

  const m = await db
    .insertInto("membership")
    .values({ tenantId, organizationId: orgId, userId: user.id, role })
    .returningAll()
    .executeTakeFirstOrThrow()
  return { userId: user.id, email: user.email, name: user.name, role, joinedAt: m.createdAt.toISOString() }
}

/** Change a member's role. Only an owner may grant or revoke ownership. */
export async function updateMemberRole(
  tenantId: string,
  orgId: string,
  callerRole: Role,
  targetUserId: string,
  role: Role,
): Promise<void> {
  const current = await membershipRole(tenantId, targetUserId, orgId)
  if (!current) throw new HttpError(404, "not_a_member")
  if ((role === "owner" || current === "owner") && callerRole !== "owner") {
    throw new HttpError(403, "owner_required", "Only an owner can grant or revoke ownership")
  }
  if (current === "owner" && role !== "owner") await assertNotLastOwner(tenantId, orgId, targetUserId)
  await db
    .updateTable("membership")
    .set({ role })
    .where("tenantId", "=", tenantId)
    .where("organizationId", "=", orgId)
    .where("userId", "=", targetUserId)
    .execute()
}

/** Remove a member. The last owner cannot be removed. */
export async function removeMember(
  tenantId: string,
  orgId: string,
  targetUserId: string,
): Promise<void> {
  const current = await membershipRole(tenantId, targetUserId, orgId)
  if (!current) throw new HttpError(404, "not_a_member")
  if (current === "owner") await assertNotLastOwner(tenantId, orgId, targetUserId)
  await db
    .deleteFrom("membership")
    .where("tenantId", "=", tenantId)
    .where("organizationId", "=", orgId)
    .where("userId", "=", targetUserId)
    .execute()
}

async function assertNotLastOwner(tenantId: string, orgId: string, userId: string): Promise<void> {
  const owners = await db
    .selectFrom("membership")
    .select("userId")
    .where("tenantId", "=", tenantId)
    .where("organizationId", "=", orgId)
    .where("role", "=", "owner")
    .execute()
  if (owners.length <= 1 && owners.some((o) => o.userId === userId)) {
    throw new HttpError(409, "last_owner", "An organization must keep at least one owner")
  }
}

/** Compare roles by privilege (owner > admin > member). */
export function outranks(a: Role, b: Role): boolean {
  return (RANK[a] ?? 0) > (RANK[b] ?? 0)
}
