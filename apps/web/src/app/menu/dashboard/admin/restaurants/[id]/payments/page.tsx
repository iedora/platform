import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireStaff } from '@iedora/product-menu/features/auth'
import { loadRestaurantDetail } from '@iedora/product-menu/features/restaurant-identity'
import { PLAN_CODES, getPlanDisplay, isPlanCode } from '@iedora/product-menu/features/plans'
import { ApiError } from '@iedora/api-client'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { PaymentsPanel } from './payments-panel'
import { planNamer } from '../../_components/admin-detail'

/**
 * Admin restaurant payments (`/menu/dashboard/admin/restaurants/[id]/payments`).
 * Cash-first: the subscription + manual invoice ledger from the billing service.
 * Staff can record a (cash) payment here. Card (Stripe) is deferred. The page
 * loads the server truth; the client {@link PaymentsPanel} owns the optimistic
 * record-payment flow (apply the event instantly, commit + audit in background).
 */
export default async function AdminRestaurantPaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireStaff()
  const { id } = await params

  const detail = await loadRestaurantDetail(id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound()
    throw e
  })

  const { restaurant: r, billing } = detail
  const sub = billing.subscriptions.find((s) => s.product === 'menu' && s.status === 'active')
  const paid = billing.invoices.filter((i) => i.status === 'paid')
  // Currency of the "paid to date" total tracks the paid invoices it sums, not
  // just any invoice on file (a draft in another currency must not relabel it).
  const currency = paid[0]?.currency ?? billing.invoices[0]?.currency ?? 'EUR'
  const [t, planName] = await Promise.all([getTranslations('Admin'), planNamer()])

  const planOptions = PLAN_CODES.map((code) => ({
    value: code,
    label: planName(code),
    priceCents: getPlanDisplay(code).priceCents,
  }))
  const defaultPlanCode = sub?.planCode && isPlanCode(sub.planCode) ? sub.planCode : 'menu_pro'

  return (
    <DashboardPage chrome="none" title={r.name} data-test-id="admin-restaurant-payments">
      <PaymentsPanel
        restaurantId={r.id}
        title={t('payments.title')}
        planCode={sub?.planCode ?? ''}
        periodEnd={sub?.currentPeriodEnd ?? null}
        invoices={billing.invoices}
        planOptions={planOptions}
        defaultPlanCode={defaultPlanCode}
        currency={currency}
        freePlanLabel={planName(undefined)}
      />
    </DashboardPage>
  )
}
