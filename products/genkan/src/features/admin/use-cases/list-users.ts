import 'server-only'
import { asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/shared/db/client'
import { member, organization, session, user } from '@/shared/db/schema'

export type AdminUserRow = {
  id: string
  email: string
  name: string
  role: string | null
  banned: boolean
  banReason: string | null
  banExpires: Date | null
  createdAt: Date
}

/**
 * Lean read for the /admin/users table. Reads `user` directly (no Better
 * Auth API call) because every column we render lives on the row.
 *
 * Search matches email/name (case-insensitive contains). Sort is stable on
 * `createdAt desc` so newly created users surface first.
 */
export async function listUsers(
  opts: { search?: string; limit?: number } = {},
): Promise<AdminUserRow[]> {
  const limit = Math.min(opts.limit ?? 200, 500)
  const term = opts.search?.trim()
  const where = term
    ? or(ilike(user.email, `%${term}%`), ilike(user.name, `%${term}%`))
    : undefined

  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(where)
    .orderBy(desc(user.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    banned: Boolean(r.banned),
    banReason: r.banReason,
    banExpires: r.banExpires,
    createdAt: r.createdAt,
  }))
}

/** Total user count — used for the table footer summary. */
export async function countUsers(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
  return row?.count ?? 0
}

export type AdminUserDetail = AdminUserRow & {
  emailVerified: boolean
  image: string | null
  updatedAt: Date
}

export async function getUserById(
  id: string,
): Promise<AdminUserDetail | null> {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1)
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    banned: Boolean(row.banned),
    banReason: row.banReason,
    banExpires: row.banExpires,
    createdAt: row.createdAt,
    emailVerified: row.emailVerified,
    image: row.image,
    updatedAt: row.updatedAt,
  }
}

export type AdminUserSession = {
  id: string
  token: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
  expiresAt: Date
  impersonatedBy: string | null
}

export async function listSessionsForUser(
  userId: string,
): Promise<AdminUserSession[]> {
  const rows = await db
    .select({
      id: session.id,
      token: session.token,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      impersonatedBy: session.impersonatedBy,
    })
    .from(session)
    .where(eq(session.userId, userId))
    .orderBy(desc(session.createdAt))
  return rows
}

export type AdminUserOrgMembership = {
  organizationId: string
  organizationName: string
  organizationSlug: string
  role: string
  createdAt: Date
}

export async function listOrganizationsForUser(
  userId: string,
): Promise<AdminUserOrgMembership[]> {
  const rows = await db
    .select({
      organizationId: member.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
  return rows
}
