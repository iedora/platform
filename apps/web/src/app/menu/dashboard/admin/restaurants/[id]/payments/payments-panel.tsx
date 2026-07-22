'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CircleAlert } from 'lucide-react'
import type { Invoice } from '@iedora/product-menu/shared/api'
import { staffRecordPaymentAction } from '@iedora/product-menu/features/restaurant-identity/actions'
import { RecordPaymentDialog, type RecordPaymentPayload } from './record-payment-dialog'
import {
  InfoRow,
  SideCard,
  Stat,
  formatDate,
  formatMoney,
  invoiceClass,
} from '../../_components/primitives'

type PlanOption = { value: string; label: string; priceCents: number }

/** An invoice row, plus a flag for the optimistic placeholder awaiting commit. */
type Row = Invoice & { pending?: boolean }

type View = { planCode: string; periodEnd: string | null; invoices: Row[] }

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Client shell for the admin payments page. Renders the billing summary, the
 * plan/method rail, the invoice ledger, and the record-payment dialog.
 *
 * Recording a payment is an optimistic action: the moment staff submit, the
 * panel applies the *event* locally (plan upgraded, period extended a year, a
 * "pending" invoice prepended) and shows it instantly, while the real commit +
 * audit run in the background through the menu BFF → billing tx → outbox relay.
 * On success a refresh swaps the optimistic row for the server's; on failure
 * the optimistic state reverts and a banner explains it. Pairs with React 19's
 * useOptimistic — see https://react.dev/reference/react/useOptimistic and
 * https://nextjs.org/docs/app/guides/forms.
 */
export function PaymentsPanel({
  restaurantId,
  title,
  planCode,
  periodEnd,
  invoices,
  planOptions,
  defaultPlanCode,
  currency,
  freePlanLabel,
}: {
  restaurantId: string
  title: string
  planCode: string
  periodEnd: string | null
  invoices: Invoice[]
  planOptions: PlanOption[]
  defaultPlanCode: string
  currency: string
  freePlanLabel: string
}) {
  const t = useTranslations('Admin')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  const base: View = { planCode, periodEnd, invoices }
  const [view, applyPayment] = useOptimistic(base, (state, p: RecordPaymentPayload): View => {
    const optimistic: Row = {
      id: `optimistic-${state.invoices.length}`,
      tenantId: '',
      product: 'menu',
      planCode: p.planCode,
      amountCents: p.amountCents,
      currency: p.currency,
      status: 'paid',
      promo: p.promo ?? null,
      createdAt: new Date().toISOString(),
      pending: true,
    }
    return {
      planCode: p.planCode,
      periodEnd: new Date(Date.now() + YEAR_MS).toISOString(),
      invoices: [optimistic, ...state.invoices],
    }
  })

  const planLabel = (code: string): string =>
    code ? (planOptions.find((o) => o.value === code)?.label ?? code) : freePlanLabel

  const paidTotal = view.invoices
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + i.amountCents, 0)

  function record(p: RecordPaymentPayload) {
    setFailed(false)
    startTransition(async () => {
      applyPayment(p)
      const res = await staffRecordPaymentAction(restaurantId, p)
      // On success, pull the server truth in so the optimistic row is replaced
      // seamlessly as the transition ends; on failure, let it revert + explain.
      if (res.ok) router.refresh()
      else setFailed(true)
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-bold tracking-[-0.01em] text-foreground">{title}</h1>
        <RecordPaymentDialog
          planOptions={planOptions}
          defaultPlanCode={defaultPlanCode}
          defaultCurrency={currency}
          onRecord={record}
        />
      </div>

      {failed ? (
        <div
          className="flex items-center justify-between gap-3 rounded-[12px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive"
          role="alert"
          data-test-id="admin-record-payment-error"
        >
          <span className="flex items-center gap-2">
            <CircleAlert size={16} aria-hidden />
            {t('payments.recordFailed')}
          </span>
          <button type="button" className="font-semibold underline" onClick={() => setFailed(false)}>
            {t('payments.dismiss')}
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Main — summary numbers + the invoice ledger. */}
        <div className="min-w-0 space-y-5">
          <section
            className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[18px] border border-border bg-card p-5 sm:grid-cols-3"
            aria-label={t('payments.summaryAria')}
            data-test-id="admin-restaurant-metrics"
          >
            <Stat label={t('payments.plan')} value={planLabel(view.planCode)} />
            <Stat label={t('payments.paidToDate')} value={formatMoney(paidTotal, currency)} />
            <Stat
              label={t('payments.nextDue')}
              value={view.periodEnd ? formatDate(view.periodEnd) : '—'}
            />
          </section>

          <SideCard title={t('payments.paymentHistory')} data-test-id="admin-payments-history">
            {view.invoices.length === 0 ? (
              <p className="py-3 text-[14px] text-muted-foreground">{t('payments.noInvoices')}</p>
            ) : (
              <ul data-test-id="admin-invoice-list">
                {view.invoices.map((inv) => (
                  <li
                    key={inv.id}
                    className={`flex items-center justify-between gap-3 border-b border-border py-[12px] last:border-b-0 ${inv.pending ? 'opacity-60' : ''}`}
                    data-test-id={inv.pending ? 'admin-invoice-pending' : undefined}
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-foreground">{formatDate(inv.createdAt)}</p>
                      <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                        {planLabel(inv.planCode)}
                        {inv.promo ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            {inv.promo}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[14px] font-bold text-foreground">
                        {formatMoney(inv.amountCents, inv.currency)}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize ${inv.pending ? 'bg-amber-100 text-amber-700' : invoiceClass(inv.status)}`}
                      >
                        {inv.pending ? t('payments.recording') : inv.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>
        </div>

        {/* Rail — plan + method properties. */}
        <div className="space-y-5">
          <SideCard title={t('payments.plan')}>
            <InfoRow label={t('payments.plan')} value={planLabel(view.planCode)} />
            <InfoRow
              label={t('payments.status')}
              value={view.planCode ? t('payments.statusActive') : freePlanLabel}
            />
            <InfoRow
              label={t('payments.renews')}
              value={view.periodEnd ? formatDate(view.periodEnd) : '—'}
            />
          </SideCard>

          <SideCard title={t('payments.paymentMethod')}>
            <InfoRow label={t('payments.method')} value={t('payments.cash')} />
            <p className="pt-2 text-[12px] text-muted-foreground">{t('payments.cashNote')}</p>
          </SideCard>
        </div>
      </div>
    </>
  )
}
