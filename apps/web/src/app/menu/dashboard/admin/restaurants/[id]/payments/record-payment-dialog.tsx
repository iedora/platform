'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { Button } from '@iedora/ui/components/ui/button'
import { AppDialog } from '@iedora/ui/components/app-dialog'
import { FieldMessage, SelectField, TextField } from '@iedora/ui/components/field'
import { formatMoney } from '../../_components/primitives'

type PlanOption = { value: string; label: string; priceCents: number }

/** The validated payment a parent applies optimistically + commits in the background. */
export type RecordPaymentPayload = {
  amountCents: number
  currency: string
  planCode: string
  promo?: string
}

/**
 * Records a manual (cash) payment against the restaurant's tenant — a paid
 * invoice. Amount is entered in major units; the discount vs the plan's list
 * price is computed live. An optional promo/campaign label is stored and shown
 * as a badge in the payment history.
 */
export function RecordPaymentDialog({
  planOptions,
  defaultPlanCode,
  defaultCurrency,
  onRecord,
}: {
  planOptions: PlanOption[]
  defaultPlanCode: string
  defaultCurrency: string
  /** Hand the validated payment up; the parent applies it optimistically and
   * commits it in the background. The dialog closes immediately on submit. */
  onRecord: (payload: RecordPaymentPayload) => void
}) {
  const t = useTranslations('Admin.payments')
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [planCode, setPlanCode] = useState(defaultPlanCode)
  const [promo, setPromo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const listCents = planOptions.find((p) => p.value === planCode)?.priceCents ?? 0
  const amountCents = useMemo(() => {
    const v = Number(amount.replace(',', '.'))
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0
  }, [amount])
  // Discount % off the list price (only when below list).
  const discountPct =
    listCents > 0 && amountCents > 0 && amountCents < listCents
      ? Math.round(((listCents - amountCents) / listCents) * 100)
      : 0

  function submit() {
    setError(null)
    if (amountCents <= 0) {
      setError(t('amountInvalid'))
      return
    }
    // Optimistic: hand the payment up and close at once — the parent paints the
    // upgrade + a pending invoice instantly while the commit + audit run async.
    onRecord({
      amountCents,
      currency: currency.trim() || defaultCurrency,
      planCode,
      promo: promo.trim() || undefined,
    })
    setOpen(false)
    setAmount('')
    setPromo('')
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-test-id="admin-record-payment-open">
        <Plus size={15} />
        {t('record')}
      </Button>
      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={t('recordTitle')}
        data-test-id="admin-record-payment-dialog"
        footer={
          <>
            <Button variant="outline" size="sm" type="button" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={submit} data-test-id="admin-record-payment-submit">
              {t('recordSubmit')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <SelectField
            label={t('planLabel')}
            value={planCode}
            onValueChange={setPlanCode}
            options={planOptions}
          />
          <TextField
            label={t('amount')}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={listCents > 0 ? (listCents / 100).toFixed(2) : '0.00'}
            autoFocus
            data-test-id="admin-record-payment-amount"
            hint={
              listCents > 0 ? (
                <span className="flex items-center gap-2">
                  <span>{t('listPrice', { price: formatMoney(listCents, currency) })}</span>
                  {discountPct > 0 ? (
                    <span
                      className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700"
                      data-test-id="admin-record-payment-discount"
                    >
                      {t('discountOff', { pct: discountPct })}
                    </span>
                  ) : null}
                </span>
              ) : undefined
            }
          />
          <TextField
            label={t('currency')}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={8}
            data-test-id="admin-record-payment-currency"
          />
          <TextField
            label={t('promo')}
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder={t('promoPlaceholder')}
            maxLength={80}
            hint={t('promoHint')}
            data-test-id="admin-record-payment-promo"
          />
          {error ? <FieldMessage error={error} /> : null}
        </div>
      </AppDialog>
    </>
  )
}
