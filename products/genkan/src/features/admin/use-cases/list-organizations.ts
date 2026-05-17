import 'server-only'
import { desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/shared/db/client'
import { invitation, member, organization, user } from '@/shared/db/schema'

export type AdminOrganizationRow = {
  id: string
  name: string
  slug: string
  membersCount: number
  createdAt: Date
}

export async function listOrganizations(
  opts: { search?: string; limit?: number } = {},
): Promise<AdminOrganizationRow[]> {
  const limit = Math.min(opts.limit ?? 200, 500)
  const term = opts.search?.trim()
  const where = term
    ? or(
        ilike(organization.name, `%${term}%`),
        ilike(organization.slug, `%${term}%`),
      )
    : undefined

  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      membersCount: sql<number>`(select count(*)::int from ${member} where ${member.organizationId} = ${organization.id})`,
    })
    .from(organization)
    .where(where)
    .orderBy(desc(organization.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    membersCount: Number(r.membersCount ?? 0),
    createdAt: r.createdAt,
  }))
}

export type AdminOrganizationDetail = {
  id: string
  name: string
  slug: string
  logo: string | null
  createdAt: Date
}

export async function getOrganizationById(
  id: string,
): Promise<AdminOrganizationDetail | null> {
  const [row] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, id))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo: row.logo,
    createdAt: row.createdAt,
  }
}

export type AdminOrganizationMember = {
  id: string
  userId: string
  email: string
  name: string
  role: string
  createdAt: Date
}

export async function listMembersForOrganization(
  organizationId: string,
): Promise<AdminOrganizationMember[]> {
  const rows = await db
    .select({
      id: member.id,
      userId: member.userId,
      email: user.email,
      name: user.name,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(desc(member.createdAt))
  return rows
}

export type AdminOrganizationInvitation = {
  id: string
  email: string
  role: string | null
  status: string
  expiresAt: Date
  createdAt: Date
  inviterEmail: string | null
}

export async function listInvitationsForOrganization(
  organizationId: string,
): Promise<AdminOrganizationInvitation[]> {
  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      inviterEmail: user.email,
    })
    .from(invitation)
    .leftJoin(user, eq(user.id, invitation.inviterId))
    .where(eq(invitation.organizationId, organizationId))
    .orderBy(desc(invitation.createdAt))
  return rows
}
