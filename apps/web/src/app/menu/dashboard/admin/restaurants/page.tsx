import Link from 'next/link'
import { PlusIcon } from '@phosphor-icons/react/ssr'
import { getTranslations } from 'next-intl/server'
import { requireStaff } from '@iedora/product-menu/features/auth'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { listRestaurantsDirectory } from '@iedora/product-menu/features/restaurant-identity'
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

  const [t, raw] = await Promise.all([getTranslations('Admin'), listRestaurantsDirectory()])

  const rows: AdminRestaurantRow[] = raw.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    tenantId: r.tenantId,
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
        <Link
          href="/menu/dashboard/admin/restaurants/new"
          data-test-id="admin-restaurants-new"
          className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-[18px] py-[11px] text-[14px] font-semibold text-white no-underline transition-colors hover:bg-primary/90"
        >
          <PlusIcon size={16} weight="bold" aria-hidden />
          {t('restaurants.newRestaurant')}
        </Link>
      }
      data-test-id="admin-restaurants"
    >
      <section aria-label={t('restaurants.listAria')} data-test-id="admin-restaurants-list">
        <RestaurantsTable rows={rows} />
      </section>
    </DashboardPage>
  )
}
