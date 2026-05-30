import { requireScope } from '@iedora/product-menu/features/auth'
import { SCOPES } from '@iedora/auth/scopes'
import { getTenantsByIds } from '@iedora/auth'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { listRestaurantsAdmin } from '@iedora/product-menu/features/restaurant-identity'
import { CreateRestaurantForm } from './create-restaurant-form'
import { RestaurantsTable, type AdminRestaurantRow } from './restaurants-table'

/**
 * Cross-tenant restaurants admin. Lists every restaurant with its
 * tenant + a transfer link, and lets admin spin up a fresh tenant +
 * restaurant from a single form. Filter / sort happen client-side
 * over the loaded set (capped at 200 rows by `listRestaurantsAdmin`).
 *
 * Gated on `staff:menu:restaurants:transfer` — the same scope that
 * marks "admin manages restaurants cross-tenant" (auto-included in
 * the iedora-admin preset via the staff:* wildcard).
 */
export default async function AdminRestaurantsPage() {
  await requireScope(SCOPES.menu.staff.restaurants.transfer)

  const raw = await listRestaurantsAdmin()

  // Hydrate tenant names in a single cross-DB round-trip (was N round-trips
  // via getTenantById in a Promise.all). Table renders names, not raw ids.
  const tenantIds = Array.from(new Set(raw.map((r) => r.tenantId)))
  const tenants = await getTenantsByIds(tenantIds)

  const rows: AdminRestaurantRow[] = raw.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    tenantId: r.tenantId,
    tenantName: tenants.get(r.tenantId)?.name ?? r.tenantId,
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt),
  }))

  return (
    <DashboardPage
      title="Restaurantes"
      description="Cross-tenant. Cria um restaurante novo (com tenant próprio) ou abre/transfere os existentes."
      data-test-id="admin-restaurants"
    >
      <section data-test-id="admin-restaurants-create">
        <CreateRestaurantForm />
      </section>

      <section
        className="space-y-3"
        aria-labelledby="admin-restaurants-list-heading"
        data-test-id="admin-restaurants-list"
      >
        <h2
          id="admin-restaurants-list-heading"
          className="font-[family-name:var(--serif)] text-lg"
        >
          Todos os restaurantes
        </h2>

        <RestaurantsTable rows={rows} />
      </section>
    </DashboardPage>
  )
}
