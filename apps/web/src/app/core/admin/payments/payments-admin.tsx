'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
} from '@iedora/billing/literals'
import {
  deletePaymentAction,
  listPaymentsAction,
  recordPaymentAction,
  searchTenantsAction,
  type TenantOption,
} from './actions'

// Hoisted formatter — the card list re-renders this per row, every
// re-render. Locale is fixed to the user's browser (toLocaleDateString
// default), kept stable here.
const DATE_FMT = new Intl.DateTimeFormat()

// One currency formatter per ISO currency code, cached on first use.
// Avoids `toFixed(2)` (which hardcodes "12.34 EUR" and ignores locale
// conventions like "12,34 €").
const CURRENCY_CACHE = new Map<string, Intl.NumberFormat>()
function fmtCurrency(amountCents: number, currency: string): string {
  let fmt = CURRENCY_CACHE.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency })
    CURRENCY_CACHE.set(currency, fmt)
  }
  return fmt.format(amountCents / 100)
}

/**
 * Client surface for the manual-payment ledger. Two stacked sections,
 * mobile-canonical: a card list of recent payments on top, an inline
 * "Record payment" form at the bottom (sticky toggle on phones, full
 * width on desktop). Search/filter live in a header row.
 */
// Mirrors what the page actually renders. `product`, `createdByUserId`,
// and `createdAt` are dropped on the server-client boundary — they were
// in the wire payload but never rendered.
type PaymentRow = {
  id: string
  tenantId: string
  planCode: string
  paidAt: string
  validMonths: number
  amountCents: number
  currency: string
  method: ManualPaymentMethod
  campaignTag: string | null
  notes: string | null
}

export function PaymentsAdmin({
  initialPayments,
  tenantNames,
  planPrices,
  planLabels,
}: {
  initialPayments: PaymentRow[]
  tenantNames: Record<string, string>
  planPrices: Record<string, number>
  planLabels: Record<string, string>
}) {
  const t = useTranslations('Core.admin.payments')
  // Children call useTranslations on the same namespace — no need to drill
  // `t` as a prop. The hook itself is stable; passing it through props
  // just adds prop noise.
  const [rows, setRows] = useState<PaymentRow[]>(initialPayments)
  const [names, setNames] = useState(tenantNames)
  const [filterMethod, setFilterMethod] = useState<ManualPaymentMethod | ''>('')
  const [filterCampaign, setFilterCampaign] = useState('')
  const [isRefreshing, startRefresh] = useTransition()
  const [showForm, setShowForm] = useState(false)

  function refresh() {
    startRefresh(async () => {
      const list = await listPaymentsAction({
        method: filterMethod || undefined,
        campaign: filterCampaign || undefined,
      })
      const normalised: PaymentRow[] = list.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        planCode: r.planCode,
        paidAt:
          r.paidAt instanceof Date ? r.paidAt.toISOString() : (r.paidAt as string),
        validMonths: r.validMonths,
        amountCents: r.amountCents,
        currency: r.currency,
        method: r.method as ManualPaymentMethod,
        campaignTag: r.campaignTag,
        notes: r.notes,
      }))
      setRows(normalised)
    })
  }

  return (
    <div className="space-y-6 pb-24" data-test-id="payments-admin">
      <FilterBar
        method={filterMethod}
        onMethod={(m) => {
          setFilterMethod(m)
          refresh()
        }}
        campaign={filterCampaign}
        onCampaign={setFilterCampaign}
        onCampaignSubmit={refresh}
        searching={isRefreshing}
      />

      {rows.length === 0 ? (
        <p
          className="rounded border border-[var(--ink-14)] bg-[var(--paper-2)] px-4 py-6 text-center text-sm text-[var(--ink-55)]"
          data-test-id="payments-empty"
        >
          {t('empty')}
        </p>
      ) : (
        <ul className="space-y-3" data-test-id="payments-list">
          {rows.map((p) => (
            <PaymentCard
              key={p.id}
              payment={p}
              tenantName={names[p.tenantId] ?? p.tenantId}
              planLabel={planLabels[p.planCode] ?? p.planCode}
              monthlyCents={planPrices[p.planCode] ?? 0}
              onDeleted={refresh}
            />
          ))}
        </ul>
      )}

      {showForm ? (
        <RecordForm
          planLabels={planLabels}
          planPrices={planPrices}
          onCancel={() => setShowForm(false)}
          onRecorded={(tenantId, tenantName) => {
            setShowForm(false)
            if (tenantName) setNames((n) => ({ ...n, [tenantId]: tenantName }))
            refresh()
          }}
        />
      ) : null}

      {/* Sticky bottom CTA — always reachable on a phone. Padding picks
          up the iPhone home-indicator inset so the button isn't under it. */}
      <div
        className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--ink-14)] bg-[var(--paper)]/95 px-4 py-3 backdrop-blur lg:left-72"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="w-full rounded bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-[var(--paper)]"
          data-test-id="payments-toggle-form"
        >
          {showForm ? t('cancelForm') : t('openForm')}
        </button>
      </div>
    </div>
  )
}

// ── Filter bar ─────────────────────────────────────────────────────

function FilterBar({
  method,
  onMethod,
  campaign,
  onCampaign,
  onCampaignSubmit,
  searching,
}: {
  method: ManualPaymentMethod | ''
  onMethod: (m: ManualPaymentMethod | '') => void
  campaign: string
  onCampaign: (v: string) => void
  onCampaignSubmit: () => void
  searching: boolean
}) {
  const t = useTranslations('Core.admin.payments')
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <select
        value={method}
        onChange={(e) => onMethod(e.target.value as ManualPaymentMethod | '')}
        className="rounded border border-[var(--ink-14)] bg-[var(--paper)] text-[var(--ink)] px-3 py-3 text-sm"
        data-test-id="payments-filter-method"
        aria-label={t('filterMethod')}
      >
        <option value="">{t('filterMethodAll')}</option>
        {MANUAL_PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>
            {t(`method.${m}`)}
          </option>
        ))}
      </select>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onCampaignSubmit()
        }}
      >
        <input
          type="search"
          placeholder={t('filterCampaignPlaceholder')}
          aria-label={t('filterCampaign')}
          spellCheck={false}
          value={campaign}
          onChange={(e) => onCampaign(e.target.value)}
          className="w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm"
          data-test-id="payments-filter-campaign"
        />
        {searching && (
          <span className="sr-only">{t('searching')}</span>
        )}
      </form>
    </div>
  )
}

// ── Payment card ───────────────────────────────────────────────────

function PaymentCard({
  payment,
  tenantName,
  planLabel,
  monthlyCents,
  onDeleted,
}: {
  payment: PaymentRow
  tenantName: string
  planLabel: string
  monthlyCents: number
  onDeleted: () => void
}) {
  const t = useTranslations('Core.admin.payments')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const expectedCents = monthlyCents * payment.validMonths
  const discountCents = expectedCents - payment.amountCents
  const discountPct =
    expectedCents > 0
      ? Math.round((discountCents / expectedCents) * 1000) / 10
      : 0
  const validUntil = new Date(payment.paidAt)
  validUntil.setMonth(validUntil.getMonth() + payment.validMonths)

  const [pending, startTransition] = useTransition()

  function onDelete() {
    // `confirm()` is the existing destructive-action gate. Worth replacing
    // with a styled modal eventually; out of scope for this pass.
    if (!confirm(t('deleteConfirm'))) return
    setDeleteError(null)
    startTransition(async () => {
      const res = await deletePaymentAction(payment.id)
      if (res.ok) onDeleted()
      else setDeleteError(res.error)
    })
  }

  return (
    <li
      className="rounded border border-[var(--ink-14)] bg-[var(--paper)] p-4 space-y-3"
      data-test-id={`payment-card-${payment.id}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{tenantName}</p>
          <p className="text-xs text-[var(--ink-55)]">
            {planLabel} · {t(`method.${payment.method}`)}
          </p>
        </div>
        <p className="font-[family-name:var(--mono)] text-sm tabular-nums">
          {fmtCurrency(payment.amountCents, payment.currency)}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--ink-55)]">
          {fmtDate(payment.paidAt)} → {fmtDate(validUntil.toISOString())}
        </span>
        {expectedCents > 0 && (
          <span
            className={`rounded px-1.5 py-0.5 font-[family-name:var(--mono)] ${
              discountPct > 0
                ? 'bg-[var(--ink-08)] text-[var(--ink)]'
                : 'text-[var(--ink-55)]'
            }`}
            data-test-id={`payment-discount-${payment.id}`}
          >
            {discountPct > 0
              ? `−${discountPct}%`
              : discountPct < 0
                ? `+${Math.abs(discountPct)}%`
                : t('discountNone')}
          </span>
        )}
        {payment.campaignTag && (
          <span
            className="rounded border border-[var(--ink-40)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--ink-55)]"
            data-test-id={`payment-campaign-${payment.id}`}
          >
            {payment.campaignTag}
          </span>
        )}
      </div>

      {payment.notes && (
        <p className="text-xs text-[var(--ink-55)] italic">
          {payment.notes}
        </p>
      )}

      {deleteError ? (
        <p
          role="alert"
          className="rounded border border-[var(--cinnabar)] bg-[var(--cinnabar-15)] px-3 py-2 text-xs text-[var(--cinnabar)]"
          data-test-id={`payment-delete-error-${payment.id}`}
        >
          {deleteError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="text-xs text-[var(--cinnabar)] hover:underline disabled:opacity-50"
          data-test-id={`payment-delete-${payment.id}`}
        >
          {pending ? t('deleting') : t('deleteAction')}
        </button>
      </div>
    </li>
  )
}

// ── Record form ────────────────────────────────────────────────────

function RecordForm({
  planLabels,
  planPrices,
  onCancel,
  onRecorded,
}: {
  planLabels: Record<string, string>
  planPrices: Record<string, number>
  onCancel: () => void
  onRecorded: (tenantId: string, tenantName?: string) => void
}) {
  const t = useTranslations('Core.admin.payments')
  // Every plan in the billing catalogue is selectable — the page
  // hydrates `planLabels` from `listProductPlans()`, so there are no
  // placeholder entries to filter out. Manual payments against the
  // default plan are valid (e.g. a discount campaign on free).
  const planCodes = useMemo(
    () => Object.keys(planLabels),
    [planLabels],
  )

  const [tenantQuery, setTenantQuery] = useState('')
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([])
  const [tenant, setTenant] = useState<TenantOption | null>(null)
  const [planCode, setPlanCode] = useState<string>(planCodes[0] ?? '')
  const [paidAt, setPaidAt] = useState(() => isoDate(new Date()))
  const [validMonths, setValidMonths] = useState(12)
  const [amountEur, setAmountEur] = useState('')
  const [method, setMethod] = useState<ManualPaymentMethod>('mbway')
  const [campaignTag, setCampaignTag] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, startTransition] = useTransition()

  function runTenantSearch(q: string) {
    setTenantQuery(q)
    startTransition(async () => {
      const rows = await searchTenantsAction(q)
      setTenantOptions(rows)
    })
  }

  function ensureTenants() {
    if (tenantOptions.length === 0) runTenantSearch('')
  }

  const monthly = planPrices[planCode] ?? 0
  const expectedEur = (monthly * validMonths) / 100
  const amountCents = Math.round(Number(amountEur) * 100)
  const discountPct =
    monthly > 0 && Number.isFinite(amountCents)
      ? Math.round(
          ((monthly * validMonths - amountCents) / (monthly * validMonths)) *
            1000,
        ) / 10
      : 0

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant) return setError(t('errorTenant'))
    if (!planCode) return setError(t('errorPlan'))
    if (!(amountCents >= 0)) return setError(t('errorAmount'))
    setError(null)
    startTransition(async () => {
      const res = await recordPaymentAction({
        tenantId: tenant.id,
        planCode,
        paidAt,
        validMonths,
        amountCents,
        method,
        campaignTag: campaignTag.trim() || null,
        notes: notes.trim() || null,
      })
      if (res.ok) onRecorded(tenant.id, tenant.name)
      else setError(res.error)
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded border border-[var(--ink)] bg-[var(--paper)] p-4"
      data-test-id="payments-form"
    >
      <h2 className="font-[family-name:var(--serif)] text-lg">
        {t('formHeading')}
      </h2>

      <FieldLabel label={t('tenantLabel')} htmlFor="pf-tenant">
        <input
          id="pf-tenant"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('tenantSearchPlaceholder')}
          value={tenant ? tenant.name : tenantQuery}
          onFocus={ensureTenants}
          onChange={(e) => {
            setTenant(null)
            runTenantSearch(e.target.value)
          }}
          className="w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm"
          data-test-id="payments-form-tenant-search"
        />
        {!tenant && tenantOptions.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-auto rounded border border-[var(--ink-14)]">
            {tenantOptions.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setTenant(o)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--paper-2)]"
                  data-test-id={`payments-form-tenant-${o.id}`}
                >
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </FieldLabel>

      <FieldLabel label={t('planLabel')} htmlFor="pf-plan">
        <select
          id="pf-plan"
          value={planCode}
          onChange={(e) => setPlanCode(e.target.value)}
          className="w-full rounded border border-[var(--ink-14)] bg-[var(--paper)] text-[var(--ink)] px-3 py-3 text-sm"
          data-test-id="payments-form-plan"
        >
          {planCodes.map((c) => (
            <option key={c} value={c}>
              {planLabels[c]} · {(planPrices[c]! / 100).toFixed(2)}€/m
            </option>
          ))}
        </select>
      </FieldLabel>

      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label={t('paidAtLabel')} htmlFor="pf-paidat">
          <input
            id="pf-paidat"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm"
            data-test-id="payments-form-paidat"
          />
        </FieldLabel>
        <FieldLabel label={t('validMonthsLabel')} htmlFor="pf-months">
          <input
            id="pf-months"
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            value={validMonths}
            onChange={(e) => setValidMonths(Number(e.target.value) || 1)}
            className="w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm tabular-nums"
            data-test-id="payments-form-months"
          />
        </FieldLabel>
      </div>

      <FieldLabel label={t('amountLabel', { eur: expectedEur.toFixed(2) })} htmlFor="pf-amount">
        <input
          id="pf-amount"
          type="number"
          step="0.01"
          min={0}
          inputMode="decimal"
          placeholder="0.00"
          value={amountEur}
          onChange={(e) => setAmountEur(e.target.value)}
          className="w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm tabular-nums"
          data-test-id="payments-form-amount"
        />
        {monthly > 0 && amountEur !== '' && (
          <p className="mt-1 text-xs text-[var(--ink-55)]">
            {discountPct > 0
              ? t('discountPreview', { pct: discountPct })
              : discountPct < 0
                ? t('overpaidPreview', { pct: Math.abs(discountPct) })
                : t('listPriceMatch')}
          </p>
        )}
      </FieldLabel>

      <FieldLabel label={t('methodLabel')} htmlFor="pf-method">
        <div className="grid grid-cols-2 gap-2" id="pf-method">
          {MANUAL_PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              aria-pressed={method === m}
              className={`rounded border px-3 py-3 text-sm ${
                method === m
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                  : 'border-[var(--ink-14)] bg-transparent'
              }`}
              data-test-id={`payments-form-method-${m}`}
            >
              {t(`method.${m}`)}
            </button>
          ))}
        </div>
      </FieldLabel>

      <FieldLabel label={t('campaignLabel')} htmlFor="pf-campaign">
        <input
          id="pf-campaign"
          type="text"
          autoComplete="off"
          placeholder={t('campaignPlaceholder')}
          value={campaignTag}
          onChange={(e) => setCampaignTag(e.target.value)}
          className="w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm"
          data-test-id="payments-form-campaign"
        />
      </FieldLabel>

      <FieldLabel label={t('notesLabel')} htmlFor="pf-notes">
        <textarea
          id="pf-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-2 text-sm"
          data-test-id="payments-form-notes"
        />
      </FieldLabel>

      {error && (
        <p
          className="rounded border border-[var(--cinnabar)] bg-[var(--cinnabar-15)] px-3 py-2 text-sm text-[var(--cinnabar)]"
          role="alert"
          data-test-id="payments-form-error"
        >
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded border border-[var(--ink-14)] px-3 py-3 text-sm"
          data-test-id="payments-form-cancel"
        >
          {t('cancelForm')}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded bg-[var(--ink)] px-3 py-3 text-sm font-semibold text-[var(--paper)] disabled:opacity-50"
          data-test-id="payments-form-submit"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  )
}

function FieldLabel({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs uppercase tracking-[0.18em] text-[var(--ink-55)] mb-2"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

// ── utils ──────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fmtDate(iso: string): string {
  return DATE_FMT.format(new Date(iso))
}
