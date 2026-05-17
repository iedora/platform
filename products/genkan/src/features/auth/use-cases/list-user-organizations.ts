import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/shared/db/client'
import { member, organization } from '@/shared/db/schema'

export type UserOrganizationClaim = {
  id: string
  slug: string
  name: string
  role: string
}

/**
 * Return every organization the given user is a member of, formatted for
 * inclusion in an OIDC userinfo claim. Called by the oauth-provider plugin
 * when the requesting client has the `org:read` scope.
 *
 * Lean read: just the columns the claim carries. No deep joins.
 */
export async function listUserOrganizations(
  userId: string,
): Promise<UserOrganizationClaim[]> {
  const rows = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug ?? '',
    name: r.name,
    role: r.role,
  }))
}
