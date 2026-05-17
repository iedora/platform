import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/shared/db/client'
import { member, organization } from '@/shared/db/schema'

export type ProfileOrganization = {
  id: string
  name: string
  slug: string
  role: string
}

export async function listProfileOrganizations(
  userId: string,
): Promise<ProfileOrganization[]> {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug ?? '',
    role: r.role,
  }))
}
