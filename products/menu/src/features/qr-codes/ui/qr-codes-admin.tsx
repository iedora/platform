'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  bindCodeAction,
  bulkGenerateAction,
  createCodeAction,
  deleteCodeAction,
  unbindCodeAction,
  updateLabelAction,
} from '../actions'
import type { QrCodeListRow, QrStats } from '../stats'
import { QrPrintSheetDialog } from '../qr-generation/qr-print-sheet-dialog'

type RestaurantOption = { id: string; name: string; slug: string }

// Inline icons — products/menu doesn't depend on lucide-react.
function Svg({ size, className, children }: { size: number; className?: string; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}
const ExternalLinkIcon = ({ size = 12, className }: { size?: number; className?: string }) => (
  <Svg size={size} className={className}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Svg>
)
const PrinterIcon = ({ size = 15, className }: { size?: number; className?: string }) => (
  <Svg size={size} className={className}>
    <path d="M6 9V2h12v7" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </Svg>
)
const TrashIcon = ({ size = 15, className }: { size?: number; className?: string }) => (
  <Svg size={size} className={className}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </Svg>
)

const INPUT =
  'w-full rounded-[12px] border border-border bg-card px-3 py-2 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cinnabar)_22%,transparent)] disabled:opacity-60'
const BTN_PRIMARY =
  'inline-flex items-center justify-center rounded-[12px] bg-primary px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--cinnabar-deep)] disabled:opacity-60'
const BTN_GHOST =
  'inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-[color-mix(in_srgb,var(--cinnabar)_40%,transparent)] disabled:opacity-60'
const LABEL = 'mb-1 block text-[12px] font-semibold text-muted-foreground'
const CARD = 'rounded-[18px] border border-border bg-card'

function RestaurantSelect({
  id,
  testId,
  restaurants,
  value,
  onChange,
  disabled,
}: {
  id: string
  testId?: string
  restaurants: RestaurantOption[]
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
}) {
  const t = useTranslations('Admin')
  return (
    <select
      id={id}
      data-test-id={testId}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={INPUT}
    >
      <option value="">{t('qrCodes.unboundOption')}</option>
      {restaurants.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  )
}

export function QrCodesAdmin({
  rows,
  restaurants,
  publicOrigin,
  stats,
}: {
  rows: QrCodeListRow[]
  restaurants: RestaurantOption[]
  publicOrigin: string
  stats: QrStats
  snapshotAt: string
}) {
  return (
    <div className="space-y-5" data-test-id="qr-codes-admin-content">
      <StatStrip stats={stats} />
      <CreatePanel restaurants={restaurants} />
      <Registry rows={rows} restaurants={restaurants} publicOrigin={publicOrigin} />
    </div>
  )
}

function StatStrip({ stats }: { stats: QrStats }) {
  const t = useTranslations('Admin')
  const items: { label: string; value: number }[] = [
    { label: t('qrCodes.statCodes'), value: stats.total },
    { label: t('qrCodes.statBound'), value: stats.bound },
    { label: t('qrCodes.statUnbound'), value: stats.unbound },
    { label: t('qrCodes.statNew24h'), value: stats.created24h },
  ]
  return (
    <div className={`${CARD} grid grid-cols-2 sm:grid-cols-4`} data-test-id="qr-codes-stats">
      {items.map((s, i) => (
        <div
          key={s.label}
          className={`p-4 ${i % 2 === 0 ? 'border-r border-border' : ''} ${
            i < 2 ? 'border-b border-border sm:border-b-0' : ''
          } ${i === 2 ? 'sm:border-r' : ''}`}
        >
          <p className="text-[24px] font-bold leading-none text-foreground">{s.value}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

function CreatePanel({ restaurants }: { restaurants: RestaurantOption[] }) {
  const t = useTranslations('Admin')
  return (
    <section className="space-y-2" data-test-id="qr-codes-create-panel">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('qrCodes.createCodes')}
      </p>
      <div className={`${CARD} space-y-4 p-4`}>
        <CreateOneForm restaurants={restaurants} />
        <div className="h-px bg-border" />
        <BulkGenerateForm />
      </div>
    </section>
  )
}

function CreateOneForm({ restaurants }: { restaurants: RestaurantOption[] }) {
  const t = useTranslations('Admin')
  const [code, setCode] = useState('')
  const [restaurantId, setRestaurantId] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await createCodeAction({
        code: code.trim() || undefined,
        restaurantId: restaurantId || undefined,
        label: label.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuccess(t('qrCodes.created', { code: res.data.code }))
      setCode('')
      setLabel('')
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" data-test-id="qr-codes-create-one-form" aria-label={t('qrCodes.createOneAria')}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="qr-code" className={LABEL}>{t('qrCodes.code')}</label>
          <input
            id="qr-code"
            data-test-id="qr-codes-create-one-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('qrCodes.codePlaceholder')}
            maxLength={64}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'qr-codes-create-one-error' : undefined}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="qr-restaurant" className={LABEL}>{t('qrCodes.bindTo')}</label>
          <RestaurantSelect
            id="qr-restaurant"
            testId="qr-codes-create-one-restaurant"
            restaurants={restaurants}
            value={restaurantId || null}
            onChange={(v) => setRestaurantId(v ?? '')}
          />
        </div>
        <div>
          <label htmlFor="qr-label" className={LABEL}>{t('qrCodes.label')}</label>
          <input
            id="qr-label"
            data-test-id="qr-codes-create-one-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('qrCodes.labelPlaceholder')}
            maxLength={200}
            className={INPUT}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {error && <p id="qr-codes-create-one-error" role="alert" className="text-[13px] text-[#D92D20]" data-test-id="qr-codes-create-one-error">{error}</p>}
        {success && <p className="text-[13px] text-muted-foreground" data-test-id="qr-codes-create-one-success">{success}</p>}
        <button type="submit" disabled={pending} className={BTN_PRIMARY} data-test-id="qr-codes-create-one-submit">
          {pending ? t('qrCodes.creating') : t('qrCodes.createCode')}
        </button>
      </div>
    </form>
  )
}

function BulkGenerateForm() {
  const t = useTranslations('Admin')
  const [count, setCount] = useState(10)
  const [error, setError] = useState<string | null>(null)
  const [generatedCount, setGeneratedCount] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setGeneratedCount(null)
    startTransition(async () => {
      const res = await bulkGenerateAction(count)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setGeneratedCount(res.data.count)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2" data-test-id="qr-codes-bulk-form" aria-label={t('qrCodes.bulkAria')}>
      <label htmlFor="qr-bulk-count" className={LABEL}>{t('qrCodes.bulkLabel')}</label>
      <div className="flex items-center gap-2">
        <input
          id="qr-bulk-count"
          data-test-id="qr-codes-bulk-count"
          type="number"
          min={1}
          max={500}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'qr-codes-bulk-error' : undefined}
          className={`${INPUT} w-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
        />
        <button type="submit" disabled={pending} className={BTN_PRIMARY} data-test-id="qr-codes-bulk-submit">
          {pending ? t('qrCodes.generating') : t('qrCodes.generateBatch')}
        </button>
      </div>
      {error && <p id="qr-codes-bulk-error" role="alert" className="text-[13px] text-[#D92D20]" data-test-id="qr-codes-bulk-error">{error}</p>}
      {generatedCount !== null && (
        <p className="text-[13px] text-muted-foreground" data-test-id="qr-codes-bulk-success">
          {t('qrCodes.generated', { count: generatedCount })}
        </p>
      )}
    </form>
  )
}

function Registry({
  rows,
  restaurants,
  publicOrigin,
}: {
  rows: QrCodeListRow[]
  restaurants: RestaurantOption[]
  publicOrigin: string
}) {
  const t = useTranslations('Admin')
  return (
    <section className="space-y-2" data-test-id="qr-codes-registry">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('qrCodes.registryCount', { count: rows.length })}
      </p>
      {rows.length === 0 ? (
        <p className={`${CARD} px-4 py-8 text-center text-[14px] text-muted-foreground`} data-test-id="qr-codes-registry-empty">
          {t('qrCodes.noCodes')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-test-id="qr-codes-registry-list">
          {rows.map((row) => (
            <CodeRow key={row.code} row={row} restaurants={restaurants} publicOrigin={publicOrigin} />
          ))}
        </ul>
      )}
    </section>
  )
}

function CodeRow({
  row,
  restaurants,
  publicOrigin,
}: {
  row: QrCodeListRow
  restaurants: RestaurantOption[]
  publicOrigin: string
}) {
  const t = useTranslations('Admin')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const stickerUrl = `${publicOrigin}/q/${row.code}`
  const createdAgo = formatRelative(row.createdAt, t)
  const bound = Boolean(row.restaurant)

  function onBindChange(next: string | null) {
    setError(null)
    startTransition(async () => {
      const res = next
        ? await bindCodeAction({ code: row.code, restaurantId: next })
        : await unbindCodeAction(row.code)
      if (!res.ok) setError(res.error)
    })
  }

  function onDelete() {
    if (!confirm(t('qrCodes.deleteConfirm', { code: row.code }))) return
    setError(null)
    startTransition(async () => {
      const res = await deleteCodeAction(row.code)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <li className={`${CARD} p-4`} data-test-id={`qr-codes-row-${row.code}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-[family-name:var(--mono)] text-[15px] font-semibold text-foreground break-all">{row.code}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                bound ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-muted text-muted-foreground'
              }`}
            >
              {bound ? t('qrCodes.bound') : t('qrCodes.unbound')}
            </span>
          </div>
          <Link
            href={`/q/${row.code}`}
            target="_blank"
            rel="noopener noreferrer"
            title={t('qrCodes.printedOnSticker')}
            data-test-id={`qr-codes-row-sticker-${row.code}`}
            className="mt-1 inline-flex max-w-full items-center gap-1 text-[12px] text-muted-foreground no-underline transition-colors hover:text-primary"
          >
            <span className="truncate">{stickerUrl.replace(/^https?:\/\//, '')}</span>
            <ExternalLinkIcon size={11} className="shrink-0" />
          </Link>
        </div>
        <time
          dateTime={row.createdAt}
          className="shrink-0 text-[12px] text-muted-foreground"
          data-test-id={`qr-codes-row-created-${row.code}`}
        >
          {createdAgo}
        </time>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`qr-row-bind-${row.code}`} className={LABEL}>{t('qrCodes.bindTo')}</label>
          <RestaurantSelect
            id={`qr-row-bind-${row.code}`}
            testId={`qr-codes-row-bind-${row.code}`}
            restaurants={restaurants}
            value={row.restaurantId ?? null}
            onChange={onBindChange}
            disabled={pending}
          />
        </div>
        <InlineLabelField row={row} disabled={pending} onError={setError} />
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setPrintOpen(true)} disabled={pending} className={BTN_GHOST} data-test-id={`qr-codes-row-print-${row.code}`}>
          <PrinterIcon size={15} /> {t('qrCodes.print')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className={`${BTN_GHOST} text-[#D92D20] hover:border-[#D92D20]`}
          data-test-id={`qr-codes-row-delete-${row.code}`}
        >
          <TrashIcon size={15} /> {t('qrCodes.delete')}
        </button>
      </div>

      <QrPrintSheetDialog open={printOpen} onOpenChange={setPrintOpen} code={row.code} stickerUrl={stickerUrl} label={row.label} />

      {error && <p className="mt-2 text-[13px] text-[#D92D20]" data-test-id={`qr-codes-row-error-${row.code}`}>{error}</p>}
    </li>
  )
}

function InlineLabelField({
  row,
  disabled,
  onError,
}: {
  row: QrCodeListRow
  disabled: boolean
  onError: (msg: string | null) => void
}) {
  const t = useTranslations('Admin')
  const [value, setValue] = useState(row.label ?? '')
  const [pending, startTransition] = useTransition()

  const lastRemote = React.useRef(row.label ?? '')
  React.useEffect(() => {
    const remote = row.label ?? ''
    if (remote !== lastRemote.current && value === lastRemote.current) {
      setValue(remote)
    }
    lastRemote.current = remote
  }, [row.label, value])

  function commit() {
    const next = value.trim()
    const current = row.label ?? ''
    if (next === current) return
    onError(null)
    startTransition(async () => {
      const res = await updateLabelAction({ code: row.code, label: next })
      if (!res.ok) {
        onError(res.error)
        setValue(current)
      }
    })
  }

  return (
    <div>
      <label htmlFor={`qr-row-label-${row.code}`} className={LABEL}>{t('qrCodes.label')}</label>
      <input
        id={`qr-row-label-${row.code}`}
        data-test-id={`qr-codes-row-label-${row.code}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.currentTarget as HTMLInputElement).blur()
          }
        }}
        disabled={disabled || pending}
        maxLength={200}
        placeholder={t('qrCodes.rowLabelPlaceholder')}
        className={INPUT}
      />
    </div>
  )
}

function formatRelative(
  input: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const d = new Date(input)
  const ms = Date.now() - d.getTime()
  const day = 24 * 60 * 60 * 1000
  if (ms < day) return t('qrCodes.relativeToday')
  if (ms < 2 * day) return t('qrCodes.relativeYesterday')
  const days = Math.floor(ms / day)
  if (days < 7) return t('qrCodes.relativeDaysAgo', { days })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
