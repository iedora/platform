import 'server-only'
import { asc } from 'drizzle-orm'
import { db } from '../../../shared/db/client'
import { restaurant } from '../../../shared/db/schema'

/**
 * Cross-tenant projection of every restaurant in the system. Used by the
 * iedora-admin QR-codes surface to bind physical stickers to any
 * restaurant regardless of org membership. Tenant scoping deliberately
 * does NOT apply — the caller must already be gated via
 * `requireScope(SCOPES.QR_CODES_*)`.
 */
export async function listRestaurantsCrossTenant() {
  return db
    .select({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
    })
    .from(restaurant)
    .orderBy(asc(restaurant.name))
}
