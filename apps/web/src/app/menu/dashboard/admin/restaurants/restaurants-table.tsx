'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CaretRightIcon, QrCodeIcon } from '@phosphor-icons/react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@iedora/ui/components/ui/table'

export type AdminRestaurantRow = {
  id: string
  name: string
  slug: string
  tenantId: string
  /** Display name of the owning tenant (joined from the tenant directory). */
  tenantName?: string
  menuCount: number
  dishCount: number
  views30d: number
  updatedAt: string // ISO
}

type SortKey = 'updatedAt' | 'views30d' | 'name'

const PT_COLLATOR = new Intl.Collator('pt-PT')

const SORTS: { key: SortKey; labelKey: 'sortRecent' | 'sortMostViewed' | 'sortAZ' }[] = [
  { key: 'updatedAt', labelKey: 'sortRecent' },
  { key: 'views30d', labelKey: 'sortMostViewed' },
  { key: 'name', labelKey: 'sortAZ' },
]

/** Short, copy-stable tenant id for the pill — full value lives in `title`. */
function shortTenant(tenantId: string): string {
  return tenantId.length > 8 ? tenantId.slice(0, 8) : tenantId
}

/**
 * Cross-tenant restaurants list (staff only) as a CRM table: Tenant →
 * Restaurant → counts. Rows are the tap target (open the record); the QR
 * action stays independently clickable. Columns reveal progressively as
 * the viewport grows, so on a phone it stays a clean two-column list (no
 * horizontal scroll).
 */
export function RestaurantsTable({ rows }: { rows: AdminRestaurantRow[] }) {
  const t = useTranslations('Admin')
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const deferredQuery = useDeferredValue(query)

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const list = rows.filter((r) =>
      !q
        ? true
        : r.name.toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q) ||
          r.tenantId.toLowerCase().includes(q) ||
          (r.tenantName?.toLowerCase().includes(q) ?? false),
    )
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return PT_COLLATOR.compare(a.name, b.name)
        case 'views30d':
          return b.views30d - a.views30d
        default:
          return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
      }
    })
  }, [rows, deferredQuery, sortKey])

  const hasFilters = query.length > 0

  function open(id: string) {
    router.push(`/menu/dashboard/admin/restaurants/${id}`)
  }

  return (
    <div className="space-y-4" data-test-id="admin-restaurants-table">
      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('restaurants.searchPlaceholder')}
          aria-label={t('restaurants.searchAria')}
          spellCheck={false}
          className="w-full rounded-[12px] border border-border bg-card px-4 py-2.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          data-test-id="admin-restaurants-search"
        />
        {hasFilters ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="shrink-0 rounded-[10px] border border-border px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            data-test-id="admin-restaurants-clear-filters"
          >
            {t('restaurants.clear')}
          </button>
        ) : null}
      </div>

      {/* Sort + count */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSortKey(s.key)}
              aria-pressed={sortKey === s.key}
              className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                sortKey === s.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
              data-test-id={`admin-restaurants-sort-${s.key}`}
            >
              {t(`restaurants.${s.labelKey}`)}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground" data-test-id="admin-restaurants-count">
          {t('restaurants.count', { shown: filtered.length, total: rows.length })}
        </p>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p
          className="rounded-[18px] border border-border bg-card px-4 py-10 text-center text-[14px] text-muted-foreground"
          data-test-id="admin-restaurants-empty"
        >
          {hasFilters ? t('restaurants.emptyNoMatch') : t('restaurants.emptyNone')}
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-[18px] border border-border bg-card"
          data-test-id="admin-restaurants-list"
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="hidden md:table-cell">{t('restaurants.colTenant')}</TableHead>
                <TableHead>{t('restaurants.colRestaurant')}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">{t('restaurants.colMenus')}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">{t('restaurants.colItems')}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{t('restaurants.colViews30d')}</TableHead>
                <TableHead className="w-[1%]" aria-label={t('restaurants.colActions')} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  onClick={() => open(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') open(r.id)
                  }}
                  tabIndex={0}
                  className="cursor-pointer outline-none focus-visible:bg-muted"
                  data-test-id={`admin-restaurants-row-${r.slug}`}
                >
                  {/* Tenant (desktop column). */}
                  <TableCell className="hidden align-middle md:table-cell">
                    <span className="block max-w-[180px] truncate text-[13.5px] font-medium text-foreground" title={r.tenantName ?? r.tenantId}>
                      {r.tenantName ?? '—'}
                    </span>
                    <span
                      className="font-mono text-[11px] text-muted-foreground"
                      title={r.tenantId}
                      data-test-id={`admin-restaurants-tenant-${r.slug}`}
                    >
                      {shortTenant(r.tenantId)}
                    </span>
                  </TableCell>

                  {/* Restaurant. */}
                  <TableCell className="align-middle">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-[14px] font-bold text-primary">
                        {r.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-[14.5px] font-semibold text-foreground">
                          {r.name}
                        </span>
                        <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
                          /r/{r.slug}
                        </span>
                        {/* Tenant inline on mobile (column hidden < md). */}
                        <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground md:hidden">
                          {r.tenantName ?? shortTenant(r.tenantId)}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden text-right align-middle text-[14px] tabular-nums text-foreground lg:table-cell">
                    {r.menuCount}
                  </TableCell>
                  <TableCell className="hidden text-right align-middle text-[14px] tabular-nums text-foreground lg:table-cell">
                    {r.dishCount}
                  </TableCell>
                  <TableCell className="hidden text-right align-middle text-[14px] tabular-nums text-foreground sm:table-cell">
                    {r.views30d.toLocaleString()}
                  </TableCell>

                  {/* Actions. */}
                  <TableCell className="align-middle">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href="/menu/dashboard/admin/qr-codes"
                        aria-label={t('restaurants.qrAria')}
                        onClick={(e) => e.stopPropagation()}
                        className="grid size-8 shrink-0 place-items-center rounded-[8px] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        <QrCodeIcon size={15} weight="bold" />
                      </Link>
                      <CaretRightIcon size={15} className="shrink-0 text-muted-foreground" aria-hidden />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
