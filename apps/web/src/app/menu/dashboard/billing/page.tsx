import { getTranslations } from 'next-intl/server'
import { requireActiveOrganization } from '@iedora/product-menu/features/auth'
import { PLANS, getOrganizationPlan } from '@iedora/product-menu/features/plans'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { Badge } from '@iedora/ui/components/ui/badge'

/**
 * Billing — current plan + the plan ladder.
 *
 * Plan changes are handled by the iedora team (the admin BFF owns plan
 * assignment; there is no tenant-facing endpoint), so the cards are
 * informational: the active plan is marked, the recommended plan is
 * badged, and the feature lists explain what an upgrade buys. Invoices
 * are processed by the admin BFF.
 *
 * The plan cards lead with a 22px restaurant-style title, a one-line
 * tagline, then a clean feature list. The current plan carries a
 * "● Active" caption — no false affordance.
 */
export default async function BillingPage() {
  // Translations are independent of auth — kick them off in parallel
  // with `requireActiveOrganization`.
  const [, t] = await Promise.all([
    requireActiveOrganization(),
    getTranslations('Billing'),
  ])

  const current = await getOrganizationPlan()

  return (
    <DashboardPage
      title={t('title')}
      eyebrow={t(`plans.${current.code}.name`)}
      data-test-id="billing"
    >
      <section
        className="grid gap-3.5 min-[720px]:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]"
        data-test-id="billing-plan-section"
        aria-label={t('currentPlanTitle')}
      >
        {/* The product sells two plans: On Us (free) and Kasa. Agency is a
            legacy/internal tier — keep it out of the ladder, but still render
            it when a tenant is actually on it so their plan isn't hidden. */}
        {PLANS.filter(
          (plan) => plan.code !== 'menu_agency' || plan.code === current.code,
        ).map((plan) => {
          const isCurrent = plan.code === current.code
          const isRecommended = Boolean(plan.isRecommended)
          const restaurantsCopy =
            plan.restaurants === -1
              ? t('unlimitedRestaurants')
              : t('restaurantsCount', { count: plan.restaurants })
          const viewsCopy =
            plan.monthlyViews === -1
              ? t('unlimitedMonthlyViews')
              : t('monthlyViewsCount', { count: plan.monthlyViews })

          return (
            <article
              key={plan.code}
              data-test-id={`billing-plan-card-${plan.code}`}
              data-current={isCurrent ? 'true' : 'false'}
              data-recommended={isRecommended ? 'true' : 'false'}
              className="grid content-start gap-3.5 rounded-lg border bg-card px-[22px] pt-[22px] pb-5 data-[current=true]:border-primary data-[current=true]:bg-primary/5 data-[recommended=true]:border-primary"
            >
              <header className="flex flex-wrap items-center gap-2.5">
                <h2 className="m-0 font-heading text-[22px] font-medium text-foreground">
                  {t(`plans.${plan.code}.name`)}
                </h2>
                {isRecommended && !isCurrent && (
                  <Badge variant="default">
                    {t(`plans.${plan.code}.badge`)}
                  </Badge>
                )}
              </header>
              <p className="m-0 text-sm leading-[1.4] text-muted-foreground">
                {t(`plans.${plan.code}.tagline`)}
              </p>
              <ul className="m-0 grid list-none gap-2 p-0 text-sm text-foreground [&>li]:relative [&>li]:pl-[18px] [&>li]:before:absolute [&>li]:before:left-1.5 [&>li]:before:text-muted-foreground [&>li]:before:content-['·']">
                <li>{restaurantsCopy}</li>
                <li>{viewsCopy}</li>
                {plan.isDefault && <li>{t('unlimitedTranslations')}</li>}
                {plan.features.includes('exportPdf') && <li>{t('exportPdf')}</li>}
                {plan.features.includes('customBranding') && (
                  <li>{t('customBranding')}</li>
                )}
              </ul>
              {isCurrent && (
                <div className="mt-1">
                  <p
                    className="m-0 inline-flex items-center gap-1.5 py-1.5 text-xs font-semibold uppercase tracking-[0.02em] text-primary"
                    data-test-id={`billing-plan-current-${plan.code}`}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-2 w-2 rounded-full bg-primary"
                    />
                    {t('activePlan')}
                  </p>
                </div>
              )}
            </article>
          )
        })}
      </section>

      <p className="text-sm text-muted-foreground" data-test-id="billing-contact">
        {t('changePlanHint')}
      </p>
    </DashboardPage>
  )
}
