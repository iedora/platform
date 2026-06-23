import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  getSession,
  isStaff,
  requireActiveOrganization,
} from '@iedora/product-menu/features/auth'
import { listRestaurantsWithCounts } from '@iedora/product-menu/features/dashboard-home'
import {
  getOrganizationAnalytics,
  getOrganizationMonthlyViews,
} from '@iedora/product-menu/features/metrics'
import {
  canAddRestaurant,
  getOrganizationPlan,
  planHas,
} from '@iedora/product-menu/features/plans'
import { addAnotherRestaurantHref } from '@iedora/product-menu/features/menu-onboarding'
import { Card, CardDesc, CardTitle } from '@iedora/ui/components/card'
import {
  KpiCard,
  ScansCard,
  ScansChart,
  TopDishesCard,
  formatDuration,
} from '@iedora/product-menu/features/dashboard-home/ui/analytics-cards'
import { DashboardPage as PageShell } from '@iedora/product-menu/shared/ui/dashboard-page'
import {
  formatEditedAt,
  formatIndex,
} from '@iedora/product-menu/shared/ui/editorial-list'

const RANGE = '30d' as const

export default async function DashboardPage() {
  const tPromise = getTranslations('Dashboard')
  const tBillingPromise = getTranslations('Billing')
  const localePromise = getLocale()

  // Staff manage everything via Admin → Restaurants; the per-tenant home is
  // meaningless for them — short-circuit before the tenant gate.
  const session = await getSession()
  if (isStaff(session)) {
    redirect('/menu/dashboard/admin/restaurants')
  }
  await requireActiveOrganization()

  const [t, tBilling, locale, restaurants, canAdd, plan, monthlyViews] =
    await Promise.all([
      tPromise,
      tBillingPromise,
      localePromise,
      listRestaurantsWithCounts(),
      canAddRestaurant(),
      getOrganizationPlan(),
      getOrganizationMonthlyViews(),
    ])

  const numberFmt = new Intl.NumberFormat(locale)
  const hasAnalytics = planHas(plan, 'analytics')

  // The full analytics view (chart + per-dish + dwell time) is a Kasa feature;
  // free accounts get the headline counts plus an upgrade nudge in its place.
  const analytics = hasAnalytics ? await getOrganizationAnalytics(RANGE) : null

  // Account-wide content totals — available to every plan, summed from the
  // restaurant list so the metric row is never empty.
  const totalMenus = restaurants.reduce((n, r) => n + r.menuCount, 0)
  const totalDishes = restaurants.reduce((n, r) => n + r.dishCount, 0)
  const peakValue = analytics
    ? analytics.dailyBreakdown.reduce((m, p) => (p.count > m ? p.count : m), 0)
    : 0

  const showIndex = restaurants.length > 1

  const actions = canAdd ? (
    <Link
      href={addAnotherRestaurantHref()}
      data-test-id="dashboard-new-restaurant"
      className="inline-flex items-center rounded-[12px] bg-primary px-4 py-2 text-[13.5px] font-semibold text-white no-underline transition-colors hover:bg-primary/90"
    >
      {t('newRestaurant')}
    </Link>
  ) : (
    <Link
      href="/menu/dashboard/billing"
      data-test-id="dashboard-upgrade-cta"
      className="inline-flex items-center rounded-[12px] border border-border px-4 py-2 text-[13.5px] font-semibold text-foreground no-underline transition-colors hover:border-primary hover:text-primary"
    >
      {tBilling('upgradeCta')}
    </Link>
  )

  return (
    <PageShell
      data-test-id="dashboard-home"
      title={t('title')}
      eyebrow={t('eyebrow')}
      description={t('subtitle')}
      actions={actions}
    >
      {/* ── Performance metrics (Pencil "App · Dashboard") ──────────── */}
      <section className="space-y-4" data-test-id="dashboard-metrics">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {analytics ? (
            <ScansCard
              range={RANGE}
              total={analytics.totalScans}
              today={analytics.todayScans}
              breakdown={analytics.dailyBreakdown}
              labels={{
                eyebrow: t(`analytics.scansEyebrow.${RANGE}`),
                tagline: t('analytics.scansTagline', {
                  today: numberFmt.format(analytics.todayScans),
                }),
              }}
            />
          ) : (
            <KpiCard
              testId="dashboard-views"
              eyebrow={t('analytics.scansEyebrow.30d')}
              value={numberFmt.format(monthlyViews)}
              caption={t('viewsThisMonth')}
            />
          )}
          <KpiCard
            testId="dashboard-menus"
            eyebrow={t('analytics.menusLabel')}
            value={numberFmt.format(analytics ? analytics.menus.total : totalMenus)}
            caption={
              analytics
                ? t('analytics.menusCaption', {
                    active: analytics.menus.active,
                    paused: analytics.menus.total - analytics.menus.active,
                  })
                : t('restaurantCount', { count: restaurants.length })
            }
          />
          <KpiCard
            testId="dashboard-dishes"
            eyebrow={t('analytics.dishesLabel')}
            value={numberFmt.format(analytics ? analytics.dishes.total : totalDishes)}
            caption={t('analytics.dishesNone')}
          />
          <KpiCard
            testId="dashboard-avg-time"
            eyebrow={t('analytics.avgTimeLabel')}
            value={analytics ? formatDuration(analytics.avgSessionSeconds) : '—'}
            caption={
              analytics && analytics.avgSessionSeconds != null
                ? t('analytics.avgTimeCaption')
                : t('analytics.avgTimeNone')
            }
          />
        </div>

        {analytics ? (
          <>
            <ScansChart
              breakdown={analytics.dailyBreakdown}
              eyebrow={t(`analytics.chartEyebrow.${RANGE}`)}
              peakLabel={
                peakValue > 0
                  ? t('analytics.chartPeak', { count: numberFmt.format(peakValue) })
                  : null
              }
              locale={locale}
            />
            <TopDishesCard
              title={t('analytics.topDishesLabel')}
              emptyLabel={t('analytics.topDishesNone')}
              viewsLabel={(n) =>
                t('analytics.topDishesViews', { count: numberFmt.format(n) })
              }
              dishes={analytics.topDishes}
            />
          </>
        ) : (
          <Link
            href="/menu/dashboard/billing"
            data-test-id="dashboard-analytics-upsell"
            className="flex flex-col gap-1 rounded-[18px] border border-dashed border-border bg-card p-6 no-underline transition-colors hover:border-primary"
          >
            <span className="text-[15px] font-bold text-foreground">
              {t('analytics.topDishesLabel')} · {t('analytics.chartEyebrow.30d')}
            </span>
            <span className="text-[13.5px] text-muted-foreground">
              {tBilling('upgradeCta')}
            </span>
          </Link>
        )}
      </section>

      {/* ── Restaurants (navigation) ────────────────────────────────── */}
      <section className="mt-8 space-y-3" data-test-id="dashboard-restaurants">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {t('restaurantsHeading')}
        </h2>
        {restaurants.length === 0 ? (
          <Card>
            <CardTitle>{t('noRestaurants')}</CardTitle>
            <CardDesc>{t('noRestaurantsHint')}</CardDesc>
          </Card>
        ) : (
          <ul
            data-test-id="restaurant-list"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {restaurants.map((r, i) => (
              <li
                key={r.id}
                data-test-id="restaurant-card"
                className="flex h-full flex-col rounded-[18px] border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/r/${r.slug}`}
                      className="block truncate text-[17px] font-bold text-foreground no-underline transition-colors hover:text-primary"
                    >
                      {r.name}
                    </Link>
                    <p className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground">
                      /r/{r.slug}
                    </p>
                  </div>
                  {showIndex ? (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {formatIndex(i + 1)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-[12.5px] text-muted-foreground">
                  {t('menuCount', { count: r.menuCount })} ·{' '}
                  {t('dishCount', { count: r.dishCount })}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {t('editedAt', {
                    when: formatEditedAt(new Date(r.updatedAt), locale),
                  })}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  <Link
                    href={`/dashboard/r/${r.slug}`}
                    className="rounded-[10px] border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground no-underline transition-colors hover:border-primary hover:text-primary"
                  >
                    {t('actionMenus')}
                  </Link>
                  <Link
                    href={`/dashboard/r/${r.slug}/theme`}
                    className="rounded-[10px] border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground no-underline transition-colors hover:border-primary hover:text-primary"
                  >
                    {t('actionTheme')}
                  </Link>
                  <Link
                    href={`/dashboard/r/${r.slug}/qr`}
                    className="rounded-[10px] border border-border px-3 py-1.5 text-[12.5px] font-medium text-foreground no-underline transition-colors hover:border-primary hover:text-primary"
                  >
                    {t('actionQr')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  )
}
