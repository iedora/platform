import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ArrowRightIcon, PlusIcon } from '@phosphor-icons/react/ssr'
import {
  listRestaurantsDirectory,
  listTenantsDirectory,
} from '@iedora/product-menu/features/restaurant-identity'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'

const RESTAURANTS_HREF = '/menu/dashboard/admin/restaurants'

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-border bg-card p-5">
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-[28px] font-extrabold tabular-nums tracking-[-0.5px] text-foreground">
        {value}
      </p>
    </div>
  )
}

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
        <Link
          href={`${RESTAURANTS_HREF}/new`}
          data-test-id="admin-overview-new"
          className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-[18px] py-[11px] text-[14px] font-semibold text-white no-underline transition-colors hover:bg-primary/90"
        >
          <PlusIcon size={16} weight="bold" aria-hidden />
          {t('restaurants.newRestaurant')}
        </Link>
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
            <ArrowRightIcon size={14} weight="bold" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="rounded-[18px] border border-border bg-card px-4 py-10 text-center text-[14px] text-muted-foreground">
            {t('restaurants.emptyNone')}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`${RESTAURANTS_HREF}/${r.id}`}
                  className="flex items-center gap-3 rounded-[18px] border border-border bg-card p-4 no-underline transition-colors hover:border-primary/50"
                  data-test-id={`admin-overview-recent-${r.slug}`}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-[15px] font-bold text-primary">
                    {r.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-foreground">{r.name}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {tenantName.get(r.tenantId) ?? `/r/${r.slug}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-[12px] text-muted-foreground">
                    {r.views30d.toLocaleString()}
                    <span className="block text-[10.5px] uppercase tracking-wide">
                      {t('overview.statViews30d')}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardPage>
  )
}
