import { Plus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { requireStaff } from '@iedora/product-menu/features/auth'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { ActionButton } from '@iedora/product-menu/shared/ui/crm'
import {
  listRestaurantsDirectory,
  listTenantsDirectory,
} from '@iedora/product-menu/features/restaurant-identity'
import { RestaurantsTable, type AdminRestaurantRow } from './restaurants-table'

/**
 * Cross-tenant restaurants directory (staff only). Lists every
 * restaurant on the platform with usage counters from the menu
 * service's staff directory. Filter / sort happen client-side over the
 * loaded set.
 *
 * Restaurant creation always lands in the CALLER'S tenant server-side,
 * so the old "create with a fresh tenant + transfer to the client"
 * admin flow is gone — provisioning for a client now happens through
 * the client's own onboarding.
 */
export default async function AdminRestaurantsPage() {
  await requireStaff()

  // The directory row only carries `tenantId`; the tenant *name* lives in the
  // tenant directory (same one the "New restaurant" picker uses), so join them
  // here to show a human label next to each restaurant.
  const [t, raw, tenants] = await Promise.all([
    getTranslations('Admin'),
    listRestaurantsDirectory(),
    listTenantsDirectory(),
  ])
  const tenantNames = new Map(tenants.map((tn) => [tn.id, tn.name]))

  const rows: AdminRestaurantRow[] = raw.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    tenantId: r.tenantId,
    tenantName: tenantNames.get(r.tenantId),
    // The staff directory row carries `menus`/`items`/`createdAt` (the service's
    // field names); map them onto the table's display fields.
    menuCount: r.menus,
    dishCount: r.items,
    views30d: r.views30d,
    updatedAt: r.createdAt,
  }))

  return (
    <DashboardPage
      title={t('restaurants.title')}
      description={t('restaurants.subtitle', { count: rows.length })}
      actions={
        <ActionButton href="/menu/dashboard/admin/restaurants/new" data-test-id="admin-restaurants-new">
          <Plus size={16} aria-hidden />
          {t('restaurants.newRestaurant')}
        </ActionButton>
      }
      data-test-id="admin-restaurants"
    >
      <section aria-label={t('restaurants.listAria')} data-test-id="admin-restaurants-list">
        <RestaurantsTable rows={rows} />
      </section>
    </DashboardPage>
  )
}
