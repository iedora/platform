import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { requireActiveOrganization } from '@iedora/product-menu/features/auth'
import { getInvoiceYears, getInvoicesForYear } from '@iedora/product-menu/features/billing'
import { PLANS, getOrganizationPlan } from '@iedora/product-menu/features/plans'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { Badge } from '@iedora/design-system'
import {
  getLatestManualPayment,
  getPlanCatalogEntry,
  paymentDiscount,
  paymentValidUntil,
} from '@iedora/billing'
import { PRODUCTS } from '@iedora/brand'
import { UpgradeButton } from './upgrade-button'

// Cached formatter pools — `Intl.*` constructors are expensive; the
// page re-renders these inline many times per request (invoice list,
// plan list, latest payment). One per (locale, currency) pair.
const MONEY_FMT_CACHE = new Map<string, Intl.NumberFormat>()
function formatMoney(amountCents: number, currency: string, locale: string) {
  const key = `${locale}|${currency}`
  let fmt = MONEY_FMT_CACHE.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, { style: 'currency', currency })
    MONEY_FMT_CACHE.set(key, fmt)
  }
  return fmt.format(amountCents / 100)
}

const ISSUED_FMT_CACHE = new Map<string, Intl.DateTimeFormat>()
function formatIssuedAt(date: Date, locale: string) {
  let fmt = ISSUED_FMT_CACHE.get(locale)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    ISSUED_FMT_CACHE.set(locale, fmt)
  }
  return fmt.format(date)
}

/**
 * Billing — plan + invoices.
 *
 * Mobile-first redesign:
 *
 *   1. The plan cards lead with a 22px restaurant-style title, a one-line
 *      tagline, then a clean feature list. The current plan replaces its
 *      button with a "● Active" caption — no false affordance. The
 *      recommended plan keeps its primary solid CTA, the alternative
 *      plans drop to the default outlined variant. The hierarchy is
 *      readable at a glance, in any age group.
 *   2. Invoices: card list, not a table. A wide table on a phone forces
 *      horizontal scroll or shrinks the type below the floor. One
 *      invoice = one card with date / plan / amount / status — works on
 *      a 360px screen the same way it works on a 27" monitor.
 *   3. Year switcher: small chips that match the editor's section
 *      chips.
 *   4. No horizontal rules. The page lays itself out on whitespace +
 *      card borders.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  // searchParams / translations / locale are independent of auth — kick
  // them off in parallel with `requireActiveOrganization`.
  const [{ tenantId }, sp, t, locale] = await Promise.all([
    requireActiveOrganization(),
    searchParams,
    getTranslations('Billing'),
    getLocale(),
  ])

  const [current, years, latestPayment] = await Promise.all([
    getOrganizationPlan(tenantId),
    getInvoiceYears(tenantId),
    getLatestManualPayment({ tenantId, product: PRODUCTS.menu }),
  ])

  // Latest offline payment derived view — discount + validity window.
  // `getPlanCatalogEntry` returns null for renamed plans; we fall back
  // to 0 so the card still renders without crashing on stale rows.
  const paymentView = latestPayment
    ? (() => {
        const catalog = getPlanCatalogEntry(PRODUCTS.menu, latestPayment.planCode)
        const discount = paymentDiscount(latestPayment, catalog?.monthlyCents ?? 0)
        const validUntil = paymentValidUntil(latestPayment)
        return {
          payment: latestPayment,
          planName: catalog?.name ?? latestPayment.planCode,
          monthlyCents: catalog?.monthlyCents ?? 0,
          discount,
          validUntil,
        }
      })()
    : null

  const currentYear = new Date().getFullYear()
  const availableYears = years.length > 0 ? years : [currentYear]
  const requested = sp.year ? Number(sp.year) : NaN
  const selectedYear =
    Number.isFinite(requested) && availableYears.includes(requested)
      ? requested
      : (availableYears[0] ?? currentYear)

  const invoices = await getInvoicesForYear(tenantId, selectedYear)

  return (
    <DashboardPage
      title={t('title')}
      eyebrow={t(`plans.${current.code}.name`)}
      data-test-id="billing"
    >
      {paymentView && (
        <section
          className="rounded border border-[var(--ink-14)] bg-[var(--paper-2)] p-4 space-y-3"
          data-test-id="billing-latest-payment"
          aria-labelledby="billing-latest-payment-heading"
        >
          <header className="flex items-baseline justify-between gap-3">
            <h2
              id="billing-latest-payment-heading"
              className="font-[family-name:var(--serif)] text-lg"
            >
              {t('latestPayment.heading')}
            </h2>
            {paymentView.payment.campaignTag && (
              <span
                className="rounded border border-[var(--ink-40)] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-55)]"
                data-test-id="billing-latest-payment-campaign"
              >
                {paymentView.payment.campaignTag}
              </span>
            )}
          </header>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-[var(--ink-55)]">{t('latestPayment.plan')}</dt>
            <dd className="text-right">{paymentView.planName}</dd>

            <dt className="text-[var(--ink-55)]">{t('latestPayment.period')}</dt>
            <dd className="text-right tabular-nums">
              {formatIssuedAt(paymentView.payment.paidAt, locale)}
              {' → '}
              {formatIssuedAt(paymentView.validUntil, locale)}
            </dd>

            <dt className="text-[var(--ink-55)]">{t('latestPayment.paid')}</dt>
            <dd className="text-right font-[family-name:var(--mono)] tabular-nums">
              {formatMoney(
                paymentView.payment.amountCents,
                paymentView.payment.currency,
                locale,
              )}
            </dd>

            {paymentView.monthlyCents > 0 && (
              <>
                <dt className="text-[var(--ink-55)]">{t('latestPayment.listPrice')}</dt>
                <dd className="text-right font-[family-name:var(--mono)] tabular-nums">
                  {formatMoney(
                    paymentView.discount.expectedCents,
                    paymentView.payment.currency,
                    locale,
                  )}
                </dd>

                <dt className="text-[var(--ink-55)]">{t('latestPayment.discount')}</dt>
                <dd className="text-right font-[family-name:var(--mono)] tabular-nums">
                  {paymentView.discount.discountPct > 0
                    ? `−${paymentView.discount.discountPct}%`
                    : paymentView.discount.discountPct < 0
                      ? `+${Math.abs(paymentView.discount.discountPct)}%`
                      : '—'}
                </dd>
              </>
            )}

            <dt className="text-[var(--ink-55)]">{t('latestPayment.method')}</dt>
            <dd className="text-right uppercase tracking-wide">
              {t(`latestPayment.methodLabel.${paymentView.payment.method}`)}
            </dd>
          </dl>
        </section>
      )}

      <section
        className="billing-plans"
        data-test-id="billing-plan-section"
        aria-label={t('currentPlanTitle')}
      >
        {PLANS.map((plan) => {
          const isCurrent = plan.code === current.code
          const isRecommended = Boolean(plan.isRecommended)
          const restaurantsCopy =
            plan.limits.restaurants === Number.POSITIVE_INFINITY
              ? t('unlimitedRestaurants')
              : t('restaurantsCount', { count: plan.limits.restaurants })
          const viewsCopy =
            plan.limits.monthlyViews === Number.POSITIVE_INFINITY
              ? t('unlimitedMonthlyViews')
              : t('monthlyViewsCount', { count: plan.limits.monthlyViews })
          const aiCopy = t('aiMenuGenerationsPerWeek', {
            count: plan.limits.aiMenuGenerationsPerWeek,
          })

          return (
            <article
              key={plan.code}
              data-test-id={`billing-plan-card-${plan.code}`}
              data-current={isCurrent ? 'true' : 'false'}
              data-recommended={isRecommended ? 'true' : 'false'}
              className="billing-plan-card"
            >
              <header className="billing-plan-card__head">
                <h2 className="billing-plan-card__name">
                  {t(`plans.${plan.code}.name`)}
                </h2>
                {isRecommended && !isCurrent && (
                  <Badge variant="live">
                    {t(`plans.${plan.code}.badge`)}
                  </Badge>
                )}
              </header>
              <p className="billing-plan-card__tagline">
                {t(`plans.${plan.code}.tagline`)}
              </p>
              <ul className="billing-plan-card__features">
                <li>{restaurantsCopy}</li>
                <li>{viewsCopy}</li>
                <li>{aiCopy}</li>
                {plan.isDefault && <li>{t('unlimitedTranslations')}</li>}
                {plan.features.has('exportPdf') && <li>{t('exportPdf')}</li>}
                {plan.features.has('customBranding') && (
                  <li>{t('customBranding')}</li>
                )}
              </ul>
              <div className="billing-plan-card__action">
                <UpgradeButton
                  target={plan.code}
                  label={t(`plans.${plan.code}.cta`)}
                  current={isCurrent}
                  recommended={isRecommended}
                />
              </div>
            </article>
          )
        })}
      </section>

      <section
        className="billing-invoices"
        data-test-id="billing-invoices-section"
        aria-label={t('invoicesTitle')}
      >
        <header className="billing-invoices__head">
          <div>
            <h2 className="billing-invoices__title">{t('invoicesTitle')}</h2>
            <p className="billing-invoices__subtitle">
              {t('invoicesSubtitle')}
            </p>
          </div>
          <nav
            className="billing-invoices__years"
            aria-label={t('invoicesYearAria')}
          >
            {availableYears.map((year) => {
              const isSelected = year === selectedYear
              return (
                <Link
                  key={year}
                  href={`/dashboard/billing?year=${year}`}
                  aria-current={isSelected ? 'page' : undefined}
                  data-active={isSelected ? 'true' : 'false'}
                  data-test-id={`billing-year-${year}`}
                  className="billing-invoices__year"
                >
                  {year}
                </Link>
              )
            })}
          </nav>
        </header>

        {invoices.length === 0 ? (
          <p
            data-test-id="billing-invoices-empty"
            className="billing-invoices__empty"
          >
            {t('invoicesEmpty', { year: selectedYear })}
          </p>
        ) : (
          <ul
            className="billing-invoice-list"
            data-test-id="billing-invoices-table"
          >
            {invoices.map((inv) => (
              <li
                key={inv.id}
                data-test-id={`billing-invoice-row-${inv.id}`}
                className="billing-invoice"
              >
                <div className="billing-invoice__top">
                  <span className="billing-invoice__date">
                    {formatIssuedAt(inv.issuedAt, locale)}
                  </span>
                  <span
                    className="billing-invoice__status"
                    data-status={inv.status}
                  >
                    {t(`status.${inv.status}`)}
                  </span>
                </div>
                <p className="billing-invoice__plan">
                  {t(`plans.${inv.plan}.name`)}
                  <span aria-hidden="true"> · </span>
                  <span className="billing-invoice__period">
                    {inv.issuedAt.toLocaleDateString(locale)}
                  </span>
                </p>
                <p className="billing-invoice__amount">
                  {formatMoney(inv.amountCents, inv.currency, locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardPage>
  )
}
