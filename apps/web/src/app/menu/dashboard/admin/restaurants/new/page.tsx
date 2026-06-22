import { getLocale, getTranslations } from 'next-intl/server'
import { requireStaff } from '@iedora/product-menu/features/auth'
import { listTenantsDirectory } from '@iedora/product-menu/features/restaurant-identity'
import { LANGUAGE_META } from '@iedora/product-menu/features/i18n'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { NewRestaurantForm } from './new-restaurant-form'

/**
 * Admin "New restaurant" (`/menu/dashboard/admin/restaurants/new`).
 *
 * Staff provision a restaurant under an existing tenant or a brand-new one, in
 * one of two modes (a toggle): fill the form manually, or paste a JSON document
 * that defines the restaurant + its full menu. Every restaurant starts on the
 * free On Us plan; upgrades happen on the Payments page. The tenant list feeds
 * the picker; the actual writes are staff-gated server actions.
 */
export default async function AdminNewRestaurantPage() {
  await requireStaff()

  const [t, locale, tenants] = await Promise.all([
    getTranslations('Admin'),
    getLocale(),
    listTenantsDirectory(),
  ])

  return (
    <DashboardPage
      title={t('newRestaurant.title')}
      description={t('newRestaurant.subtitle')}
      data-test-id="admin-new-restaurant"
    >
      <NewRestaurantForm
        tenants={tenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          ownerEmail: tenant.owner.email,
        }))}
        languages={LANGUAGE_META.map((l) => ({ code: l.code, label: l.nativeName }))}
        defaultLanguage={locale}
      />
    </DashboardPage>
  )
}
