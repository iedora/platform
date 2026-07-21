'use client'

import * as React from 'react'
import { useDeferredValue, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  bindCodeAction,
  bulkGenerateAction,
  createCodeAction,
  deleteCodeAction,
  logQrPrintAction,
  unbindCodeAction,
  updateLabelAction,
} from '../actions'
import type { QrCodeListRow, QrStats } from '../stats'
import { QrPrintSheetDialog } from '../qr-generation/qr-print-sheet-dialog'
import { ArrowSquareOutIcon, PrinterIcon, TrashIcon } from '@phosphor-icons/react'
import { SelectField, TextField } from '@iedora/ui/components/field'
import { ConfirmDialog } from '@iedora/ui/components/confirm-dialog'
import { Badge } from '@iedora/ui/components/ui/badge'
import { Button } from '@iedora/ui/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@iedora/ui/components/ui/card'
import { Input } from '@iedora/ui/components/ui/input'
import { Label } from '@iedora/ui/components/ui/label'
import { Separator } from '@iedora/ui/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@iedora/ui/components/ui/tabs'

type RestaurantOption = { id: string; name: string; slug: string }
type QrSegment = 'all' | 'open' | 'bound'

const UNBOUND_VALUE = '__unbound__'

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
  const options = React.useMemo(
    () => [
      { value: UNBOUND_VALUE, label: t('qrCodes.unboundOption') },
      ...restaurants.map((r) => ({ value: r.id, label: r.name })),
    ],
    [restaurants, t],
  )

  return (
    <SelectField
      id={id}
      label={t('qrCodes.bindTo')}
      data-test-id={testId}
      value={value ?? UNBOUND_VALUE}
      onValueChange={(next) => onChange(next === UNBOUND_VALUE ? null : next)}
      disabled={disabled}
      options={options}
      className="gap-1.5"
    />
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
}) {
  const [segment, setSegment] = useState<QrSegment>('all')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const filteredRows = filterRows(rows, segment, deferredQuery)

  return (
    <div className="space-y-5" data-test-id="qr-codes-admin-content">
      <div className="grid gap-5 lg:grid-cols-[320px_1fr] lg:items-start">
        <aside className="space-y-5" data-test-id="qr-codes-crm-rail">
          <StatStrip stats={stats} />
          <CreatePanel restaurants={restaurants} />
        </aside>
        <Registry
          rows={rows}
          filteredRows={filteredRows}
          restaurants={restaurants}
          publicOrigin={publicOrigin}
          segment={segment}
          onSegmentChange={setSegment}
          query={query}
          onQueryChange={setQuery}
        />
      </div>
    </div>
  )
}

function StatStrip({ stats }: { stats: QrStats }) {
  const t = useTranslations('Admin')
  const items: { label: string; value: number; caption: string }[] = [
    { label: t('qrCodes.statCodes'), value: stats.total, caption: t('qrCodes.statCodesHint') },
    { label: t('qrCodes.statBound'), value: stats.bound, caption: t('qrCodes.statBoundHint') },
    { label: t('qrCodes.statUnbound'), value: stats.unbound, caption: t('qrCodes.statUnboundHint') },
    { label: t('qrCodes.statNew24h'), value: stats.created24h, caption: t('qrCodes.statNew24hHint') },
  ]

  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2" data-test-id="qr-codes-stats">
      {items.map((s) => (
        <Card key={s.label} size="sm">
          <CardContent>
            <Badge variant="secondary">{s.label}</Badge>
            <p className="mt-2 font-heading text-[26px] font-bold tabular-nums tracking-[-0.5px] text-foreground">
              {s.value}
            </p>
            <p className="mt-1 truncate text-[12px] text-muted-foreground">{s.caption}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}

function CreatePanel({ restaurants }: { restaurants: RestaurantOption[] }) {
  const t = useTranslations('Admin')
  return (
    <Card className="gap-0 py-0" data-test-id="qr-codes-create-panel">
      <CardHeader className="border-b border-border bg-muted/30 p-4">
        <CardTitle className="text-[12px]">{t('qrCodes.createCodes')}</CardTitle>
        <CardDescription>{t('qrCodes.createCodesHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-4">
        <CreateOneForm restaurants={restaurants} />
        <Separator />
        <BulkGenerateForm />
      </CardContent>
    </Card>
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-bold tracking-[-0.2px] text-foreground">{t('qrCodes.createOneTitle')}</p>
          <p className="text-[12px] text-muted-foreground">{t('qrCodes.createOneHint')}</p>
        </div>
        <Badge className="text-primary">{t('qrCodes.crmLeadTag')}</Badge>
      </div>
      <div className="grid gap-3">
        <TextField
          id="qr-code"
          data-test-id="qr-codes-create-one-code"
          name="code"
          label={t('qrCodes.code')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('qrCodes.codePlaceholder')}
          maxLength={64}
          error={error ?? undefined}
          className="gap-1.5"
        />
        <RestaurantSelect
          id="qr-restaurant"
          testId="qr-codes-create-one-restaurant"
          restaurants={restaurants}
          value={restaurantId || null}
          onChange={(v) => setRestaurantId(v ?? '')}
        />
        <TextField
          id="qr-label"
          data-test-id="qr-codes-create-one-label"
          label={t('qrCodes.label')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('qrCodes.labelPlaceholder')}
          maxLength={200}
          className="gap-1.5"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {success && <p className="text-[13px] text-muted-foreground" data-test-id="qr-codes-create-one-success">{success}</p>}
        <Button type="submit" loading={pending} className="ml-auto" data-test-id="qr-codes-create-one-submit">
          {t('qrCodes.createCode')}
        </Button>
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
    <form onSubmit={onSubmit} className="space-y-3" data-test-id="qr-codes-bulk-form" aria-label={t('qrCodes.bulkAria')}>
      <div>
        <p className="text-[15px] font-bold tracking-[-0.2px] text-foreground">{t('qrCodes.bulkTitle')}</p>
        <p className="text-[12px] text-muted-foreground">{t('qrCodes.bulkHint')}</p>
      </div>
      <TextField
        id="qr-bulk-count"
        data-test-id="qr-codes-bulk-count"
        type="number"
        min={1}
        max={500}
        label={t('qrCodes.bulkLabel')}
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        error={error ?? undefined}
        className="gap-1.5"
        inputMode="numeric"
      />
      <Button type="submit" loading={pending} className="w-full" data-test-id="qr-codes-bulk-submit">
        {t('qrCodes.generateBatch')}
      </Button>
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
  filteredRows,
  restaurants,
  publicOrigin,
  segment,
  onSegmentChange,
  query,
  onQueryChange,
}: {
  rows: QrCodeListRow[]
  filteredRows: QrCodeListRow[]
  restaurants: RestaurantOption[]
  publicOrigin: string
  segment: QrSegment
  onSegmentChange: (segment: QrSegment) => void
  query: string
  onQueryChange: (query: string) => void
}) {
  const t = useTranslations('Admin')
  return (
    <Card className="gap-0 py-0" data-test-id="qr-codes-registry">
      <CardHeader className="gap-3 border-b border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-[15px]">{t('qrCodes.registryTitle')}</CardTitle>
          <Badge variant="secondary" data-test-id="qr-codes-registry-filtered-count">
            {t('qrCodes.filteredCount', { count: filteredRows.length })}
          </Badge>
        </div>
        {/* Filter + search: stack on mobile; tabs left, search fills the rest on sm+. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs
            value={segment}
            onValueChange={(value) => onSegmentChange(value as QrSegment)}
            data-test-id="qr-codes-segments"
            className="w-full sm:w-auto"
          >
            <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
              {(['all', 'open', 'bound'] as const).map((item) => (
                <TabsTrigger key={item} value={item} data-test-id={`qr-codes-segment-${item}`}>
                  {t(`qrCodes.segment.${item}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Label htmlFor="qr-codes-search" className="sr-only">{t('qrCodes.searchLabel')}</Label>
          <Input
            id="qr-codes-search"
            data-test-id="qr-codes-search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('qrCodes.searchPlaceholder')}
            className="sm:flex-1"
          />
        </div>
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent className="px-4 py-12 text-center text-[14px] text-muted-foreground" data-test-id="qr-codes-registry-empty">
          {t('qrCodes.noCodes')}
        </CardContent>
      ) : filteredRows.length === 0 ? (
        <CardContent className="px-4 py-12 text-center text-[14px] text-muted-foreground" data-test-id="qr-codes-registry-no-results">
          {t('qrCodes.noResults')}
        </CardContent>
      ) : (
        <CardContent className="bg-muted/20 p-3 sm:p-4">
          <ul className="flex flex-col gap-3" data-test-id="qr-codes-registry-list">
            {filteredRows.map((row) => (
              <CodeRow key={row.code} row={row} restaurants={restaurants} publicOrigin={publicOrigin} />
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const stickerUrl = `${publicOrigin}/q/${row.code}`
  const createdAgo = formatRelative(row.createdAt, t)
  const bound = Boolean(row.restaurant)
  const accountName = row.restaurant?.name ?? t('qrCodes.openAccount')

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
    setError(null)
    startTransition(async () => {
      const res = await deleteCodeAction(row.code)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setConfirmOpen(false)
    })
  }

  return (
    <li data-test-id={`qr-codes-row-${row.code}`}>
      <Card size="sm" className={bound ? undefined : 'bg-muted/40'}>
        <CardContent>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-all font-mono text-[15px] font-semibold text-foreground">{row.code}</span>
                <Badge
                  variant={bound ? 'default' : 'secondary'}
                  className={bound ? 'text-green-700' : undefined}
                  data-test-id={`qr-codes-row-status-${row.code}`}
                >
                  {bound ? t('qrCodes.bound') : t('qrCodes.unbound')}
                </Badge>
              </div>
              <p className="mt-1 text-[13px] font-semibold text-foreground" data-test-id={`qr-codes-row-account-${row.code}`}>
                {accountName}
              </p>
              <Link
                href={`/q/${row.code}`}
                target="_blank"
                rel="noopener noreferrer"
                title={t('qrCodes.printedOnSticker')}
                data-test-id={`qr-codes-row-sticker-${row.code}`}
                className="mt-1 inline-flex max-w-full items-center gap-1 text-[12px] text-muted-foreground no-underline transition-colors hover:text-primary"
              >
                <span className="truncate">{stickerUrl.replace(/^https?:\/\//, '')}</span>
                <ArrowSquareOutIcon size={11} className="shrink-0" />
              </Link>
            </div>
            <time
              dateTime={row.createdAt}
              className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground"
              data-test-id={`qr-codes-row-created-${row.code}`}
            >
              {createdAgo}
            </time>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(220px,0.95fr)_minmax(220px,1fr)]">
            <RestaurantSelect
              id={`qr-row-bind-${row.code}`}
              testId={`qr-codes-row-bind-${row.code}`}
              restaurants={restaurants}
              value={row.restaurantId ?? null}
              onChange={onBindChange}
              disabled={pending}
            />
            <InlineLabelField row={row} disabled={pending} onError={setError} />
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPrintOpen(true)}
              disabled={pending}
              data-test-id={`qr-codes-row-print-${row.code}`}
            >
              <PrinterIcon size={15} /> {t('qrCodes.print')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={pending}
              className="text-destructive hover:border-destructive hover:text-destructive"
              data-test-id={`qr-codes-row-delete-${row.code}`}
            >
              <TrashIcon size={15} /> {t('qrCodes.delete')}
            </Button>
          </div>

          <QrPrintSheetDialog
            open={printOpen}
            onOpenChange={setPrintOpen}
            code={row.code}
            stickerUrl={stickerUrl}
            label={row.label}
            onPrinted={
              row.restaurant
                ? (options) =>
                    logQrPrintAction(row.restaurant!.slug, {
                      kind: 'sticker',
                      code: row.code,
                      ...options,
                    })
                : undefined
            }
          />

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={t('qrCodes.deleteTitle')}
            description={t('qrCodes.deleteConfirm', { code: row.code })}
            confirmLabel={t('qrCodes.delete')}
            cancelLabel={t('qrCodes.cancel')}
            onConfirm={onDelete}
            loading={pending}
            destructive
            data-test-id={`qr-codes-row-delete-dialog-${row.code}`}
          />

          {error && <p className="mt-2 text-[13px] text-destructive" data-test-id={`qr-codes-row-error-${row.code}`}>{error}</p>}
        </CardContent>
      </Card>
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
    <TextField
      id={`qr-row-label-${row.code}`}
      data-test-id={`qr-codes-row-label-${row.code}`}
      label={t('qrCodes.label')}
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
      className="gap-1.5"
    />
  )
}

function filterRows(rows: QrCodeListRow[], segment: QrSegment, query: string): QrCodeListRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (segment === 'open' && row.restaurantId) return false
    if (segment === 'bound' && !row.restaurantId) return false
    if (!q) return true
    return [row.code, row.label, row.restaurant?.name, row.restaurant?.slug]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(q))
  })
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
