import 'server-only'
import { cache } from 'react'
import { ApiError } from '@iedora/api-client'
import * as api from '../../shared/api'
import type { PublicMenu } from '../menu-publishing/rsc/types'

/**
 * Public API of the restaurant-identity slice.
 *
 * Server actions live at `@/features/restaurant-identity/actions` (Next
 * 'use server' rules don't traverse barrels reliably). The client UI lives
 * at `@/features/restaurant-identity/ui/*` and is imported directly.
 *
 * Identity reads come straight off `requireRestaurantBySlug` (the
 * Restaurant DTO carries theme, languages and description i18n) — the
 * old per-field loaders are gone. What remains here are the two
 * cross-cutting read loaders the dashboard pages need.
 */

export type {
  StaffRestaurantRow,
  StaffRestaurantFull,
  AdminUser,
  AdminUserDetail,
  AdminUserSession,
} from '../../shared/api'

/**
 * Staff-only cross-tenant user directory (admin Users page). Search by email
 * or name. Staff-role enforced by the service; the page gates with
 * `requireStaff` first.
 */
export const listUsersDirectory = cache(async (q?: string) => {
  const { users } = await api.staffUsers(q)
  return users
})

/**
 * One user's profile (+ memberships) and session history for the admin user
 * detail page. Returns null on a 404 so the page can `notFound()`. The activity
 * timeline loads lazily via the `loadUserAuditAction` server action.
 */
export const loadUserDetail = cache(async (id: string) => {
  try {
    return await api.staffUserDetail(id)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
})

/**
 * Staff-only cross-tenant restaurant directory (admin restaurants
 * page). The service enforces the staff role on the token; the page
 * gates with `requireStaff` first so non-staff never see the surface.
 */
export const listRestaurantsDirectory = cache(async (q?: string) => {
  const { restaurants } = await api.staffDirectory(q)
  return restaurants
})

/**
 * Tenants (with owners) for the admin "New restaurant" tenant picker. Staff-role
 * enforced by the service; the page gates with `requireStaff` first.
 */
export const listTenantsDirectory = cache(async () => {
  const { tenants } = await api.staffListTenants()
  return tenants
})

/**
 * Aggregated detail for one restaurant (admin detail / payments / edit
 * pages): record + menus + trend + the tenant's billing + the audit
 * trail. Staff-role enforced by the service; pages gate with `requireStaff`.
 */
export const loadRestaurantDetail = cache(async (id: string) => {
  return api.staffRestaurantDetail(id)
})

/**
 * One restaurant's full menu tree serialized into the JSON-import shape, for the
 * admin "Edit menu as JSON" page. Staff-role enforced by the service.
 */
export const loadMenuJson = cache(async (id: string) => {
  return api.staffExportMenus(id)
})

/**
 * Active menus of one restaurant projected into the public render
 * shape, in the restaurant's default language — feeds the theme
 * editor's live preview. Ownership is enforced by the service
 * (the tree call 404s for foreign slugs).
 */
export const loadThemePreviewMenus = cache(async (slug: string): Promise<PublicMenu[]> => {
  const tree = await api.getMenuTree(slug)
  return tree.menus
    .filter((m) => m.active)
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      categories: m.categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        // Preview parity with the public read model: unavailable items
        // don't render on the guest menu, so they don't preview either.
        items: c.items
          .filter((i) => i.available)
          .map((i) => ({
            id: i.id,
            name: i.name,
            description: i.description,
            priceCents: i.priceCents,
            currency: i.currency,
            imageUrl: i.imageUrl,
            tags: i.tags,
            variants: i.variants.map((v) => ({ label: v.label, priceCents: v.priceCents })),
          })),
      })),
    }))
})
