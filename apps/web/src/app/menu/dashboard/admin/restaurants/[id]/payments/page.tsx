import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireStaff } from '@iedora/product-menu/features/auth'
import { loadRestaurantDetail } from '@iedora/product-menu/features/restaurant-identity'
import { ApiError } from '@iedora/api-client'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import {
  AdminButton,
  AdminCard,
  InfoRow,
  InvoiceList,
  Metric,
  formatDate,
  formatMoney,
  planNamer,
} from '../../_components/admin-detail'

/**
 * Admin restaurant payments (`/menu/dashboard/admin/restaurants/[id]/payments`).
 * Cash-first: the subscription + manual invoice ledger from the billing service.
 * Card (Stripe) is deferred — surfaced as "soon", not wired.
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
  const paidTotal = paid.reduce((sum, i) => sum + i.amountCents, 0)
  const [t, planName] = await Promise.all([getTranslations('Admin'), planNamer()])

  return (
    <DashboardPage
      title={t('payments.title')}
      eyebrow={r.name}
      description={`/m/${r.slug}`}
      data-test-id="admin-restaurant-payments"
    >
      <div className="mb-5">
        <AdminButton href={`/menu/dashboard/admin/restaurants/${r.id}`}>
          ← {t('payments.backRestaurant')}
        </AdminButton>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={t('payments.summaryAria')}>
        <Metric label={t('payments.plan')} value={planName(sub?.planCode)} />
        <Metric label={t('payments.paidToDate')} value={formatMoney(paidTotal, currency)} />
        <Metric
          label={t('payments.nextDue')}
          value={sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : '—'}
        />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <AdminCard title={t('payments.paymentHistory')} data-test-id="admin-payments-history">
          <InvoiceList invoices={billing.invoices} planName={planName} />
        </AdminCard>

        <div className="grid content-start gap-5">
          <AdminCard title={t('payments.plan')}>
            <InfoRow label={t('payments.plan')} value={planName(sub?.planCode)} />
            <InfoRow label={t('payments.status')} value={sub ? sub.status : planName(undefined)} />
            <InfoRow
              label={t('payments.renews')}
              value={sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : '—'}
            />
          </AdminCard>

          <AdminCard title={t('payments.paymentMethod')}>
            <InfoRow label={t('payments.method')} value={t('payments.cash')} />
            <p className="py-2 text-[12px] text-muted-foreground">{t('payments.cashNote')}</p>
          </AdminCard>
        </div>
      </div>
    </DashboardPage>
  )
}
