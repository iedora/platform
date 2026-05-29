import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../../shared/db/client'
import { restaurant } from '../../../shared/db/schema'

/**
 * Fast yes/no — does the tenant own at least one restaurant row,
 * regardless of onboarding state. Used by `/menu/onboarding` to
 * decide whether the page is a legitimate first-time landing
 * (tenant has zero) or a navigation slip (tenant has restaurants,
 * route should bounce to the dashboard).
 *
 * `SELECT 1 ... LIMIT 1` keeps the query cheap on tenants with many
 * restaurants.
 */
export async function tenantHasRestaurant(
  tenantId: string,
): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(restaurant)
    .where(eq(restaurant.tenantId, tenantId))
    .limit(1)
  return rows.length > 0
}
