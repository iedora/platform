'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { QrCodeIcon } from '@phosphor-icons/react'

export type AdminRestaurantRow = {
  id: string
  name: string
  slug: string
  tenantId: string
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

// One column template shared by the header row and every data row — this is
// what guarantees cells line up under their headers (the misalignment fix).
// Columns: Restaurant · Tenant · Menus · Items · Views 30d · Status · Actions
// (Pencil "Admin · Restaurants" U4kxT).
const GRID_COLS =
  'grid grid-cols-[minmax(170px,1fr)_116px_72px_72px_92px_88px_124px] items-center gap-3'

/** Short, copy-stable tenant id for the pill — full value lives in `title`. */
function shortTenant(tenantId: string): string {
  return tenantId.length > 8 ? tenantId.slice(0, 8) : tenantId
}

/** Warm-light cross-tenant restaurants list (Pencil "Admin · Restaurants"). */
export function RestaurantsTable({ rows }: { rows: AdminRestaurantRow[] }) {
  const t = useTranslations('Admin')
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
          r.tenantId.toLowerCase().includes(q),
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
        <div className="flex gap-1.5">
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

      {/* Cards */}
      {filtered.length === 0 ? (
        <p className="rounded-[18px] border border-border bg-card px-4 py-10 text-center text-[14px] text-muted-foreground" data-test-id="admin-restaurants-empty">
          {hasFilters ? t('restaurants.emptyNoMatch') : t('restaurants.emptyNone')}
        </p>
      ) : (
        <div
          className="overflow-x-auto rounded-[18px] border border-border bg-card"
          data-test-id="admin-restaurants-list"
        >
          {/* Header + every row share GRID_COLS so columns always line up. */}
          <div role="table" className="min-w-[860px]">
            <div
              role="row"
              className={`${GRID_COLS} border-b border-border bg-muted px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground`}
            >
              <span role="columnheader">{t('restaurants.colRestaurant')}</span>
              <span role="columnheader">{t('restaurants.colTenant')}</span>
              <span role="columnheader" className="text-right">{t('restaurants.colMenus')}</span>
              <span role="columnheader" className="text-right">{t('restaurants.colItems')}</span>
              <span role="columnheader" className="text-right">{t('restaurants.colViews30d')}</span>
              <span role="columnheader">{t('restaurants.colStatus')}</span>
              <span role="columnheader" className="text-right">{t('restaurants.colActions')}</span>
            </div>
            {filtered.map((r) => {
              const live = r.dishCount > 0
              return (
                <div
                  role="row"
                  key={r.id}
                  className={`${GRID_COLS} border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted`}
                  data-test-id={`admin-restaurants-row-${r.slug}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-[14px] font-bold text-primary">
                      {r.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/menu/dashboard/admin/restaurants/${r.id}`}
                        className="block truncate text-[14.5px] font-semibold text-foreground no-underline transition-colors hover:text-primary"
                      >
                        {r.name}
                      </Link>
                      <p className="truncate font-mono text-[11.5px] text-muted-foreground">/r/{r.slug}</p>
                    </div>
                  </div>
                  <span>
                    <span
                      className="inline-flex max-w-full items-center truncate rounded-full bg-muted px-2.5 py-1 font-mono text-[11.5px] text-muted-foreground"
                      title={r.tenantId}
                      data-test-id={`admin-restaurants-tenant-${r.slug}`}
                    >
                      {shortTenant(r.tenantId)}
                    </span>
                  </span>
                  <span className="text-right text-[14px] tabular-nums text-foreground">{r.menuCount}</span>
                  <span className="text-right text-[14px] tabular-nums text-foreground">{r.dishCount}</span>
                  <span className="text-right text-[14px] tabular-nums text-foreground">
                    {r.views30d.toLocaleString()}
                  </span>
                  <span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                        live ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      {live ? t('restaurants.statusLive') : t('restaurants.statusDraft')}
                    </span>
                  </span>
                  <span className="flex items-center justify-end gap-2">
                    <Link
                      href="/menu/dashboard/admin/qr-codes"
                      aria-label={t('restaurants.qrAria')}
                      className="grid size-8 shrink-0 place-items-center rounded-[8px] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <QrCodeIcon size={15} weight="bold" />
                    </Link>
                    <Link
                      href={`/menu/dashboard/admin/restaurants/${r.id}`}
                      className="inline-flex items-center rounded-[8px] bg-primary px-3 py-1.5 text-[13px] font-semibold text-white no-underline transition-colors hover:bg-primary/90"
                    >
                      {t('restaurants.open')}
                    </Link>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
