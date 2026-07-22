import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArrowRight, Plus } from 'lucide-react'
import {
  listRestaurantsDirectory,
  listTenantsDirectory,
} from '@iedora/product-menu/features/restaurant-identity'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { ActionButton, RecordCard, StatCard } from '@iedora/product-menu/shared/ui/crm'

const RESTAURANTS_HREF = '/menu/dashboard/admin/restaurants'

/**
 * Staff landing — a CRM-style admin home. Cross-tenant headline numbers
 * (restaurants / tenants / views / menus) over the directory, then the
 * most recently created restaurants as quick record links. Replaces the
 * old "staff just redirect to the list" behaviour.
 */
export async function AdminOverview() {
  const [t, rows, tenants] = await Promise.all([
    getTranslations('Admin'),
    listRestaurantsDirectory(),
    listTenantsDirectory(),
  ])

  const totalViews = rows.reduce((n, r) => n + r.views30d, 0)
  const totalMenus = rows.reduce((n, r) => n + r.menus, 0)
  const tenantName = new Map(tenants.map((tn) => [tn.id, tn.name]))
  const recent = [...rows]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, 6)

  return (
    <DashboardPage
      title={t('overview.title')}
      description={t('overview.subtitle')}
      actions={
        <ActionButton href={`${RESTAURANTS_HREF}/new`} data-test-id="admin-overview-new">
          <Plus size={16} aria-hidden />
          {t('restaurants.newRestaurant')}
        </ActionButton>
      }
      data-test-id="admin-overview"
    >
      {/* Headline numbers. */}
      <section
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        data-test-id="admin-overview-stats"
      >
        <StatCard label={t('overview.statRestaurants')} value={rows.length.toLocaleString()} />
        <StatCard label={t('overview.statTenants')} value={tenants.length.toLocaleString()} />
        <StatCard label={t('overview.statViews30d')} value={totalViews.toLocaleString()} />
        <StatCard label={t('overview.statMenus')} value={totalMenus.toLocaleString()} />
      </section>

      {/* Recent restaurants. */}
      <section className="space-y-3" data-test-id="admin-overview-recent">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t('overview.recent')}
          </h2>
          <Link
            href={RESTAURANTS_HREF}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary no-underline transition-colors hover:text-primary/80"
          >
            {t('overview.viewAll')}
            <ArrowRight size={14} />
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="rounded-[18px] border border-border bg-card px-4 py-10 text-center text-[14px] text-muted-foreground">
            {t('restaurants.emptyNone')}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recent.map((r) => (
              <li key={r.id}>
                <RecordCard
                  data-test-id={`admin-overview-recent-${r.slug}`}
                  titleHref={`${RESTAURANTS_HREF}/${r.id}`}
                  title={r.name}
                  subtitle={tenantName.get(r.tenantId) ?? `/r/${r.slug}`}
                  trailing={
                    <span className="text-[12px] text-muted-foreground">
                      {r.views30d.toLocaleString()}
                      <span className="block text-[10.5px] uppercase tracking-wide">
                        {t('overview.statViews30d')}
                      </span>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardPage>
  )
}
