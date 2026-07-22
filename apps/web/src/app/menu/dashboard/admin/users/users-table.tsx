'use client'

import { useRouter } from 'next/navigation'
import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronRight } from 'lucide-react'
import type { AdminUser } from '@iedora/product-menu/shared/api'
import { StatusPill, initialsOf } from '../restaurants/_components/primitives'

/** Active/banned tone for a user row (an expired ban reads as active). */
function banned(u: AdminUser): boolean {
  if (!u.banned) return false
  if (u.banExpiresAt && new Date(u.banExpiresAt).getTime() < Date.now()) return false
  return true
}

/**
 * Cross-tenant users list (staff only) as a mobile-first CRM card list. Each
 * row is the tap target → the user record. Search filters the loaded set by
 * name or email client-side. Built to stay a clean single column down to 320px
 * (no table, no horizontal scroll).
 */
export function UsersTable({ users }: { users: AdminUser[] }) {
  const t = useTranslations('Admin')
  const router = useRouter()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.name?.toLowerCase().includes(q) ?? false),
    )
  }, [users, deferredQuery])

  return (
    <div className="space-y-4" data-test-id="admin-users-table">
      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('users.searchPlaceholder')}
          aria-label={t('users.searchAria')}
          spellCheck={false}
          className="w-full min-w-0 rounded-[12px] border border-border bg-card px-4 py-2.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          data-test-id="admin-users-search"
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="shrink-0 rounded-full border border-border px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            data-test-id="admin-users-clear"
          >
            {t('users.clear')}
          </button>
        ) : null}
      </div>

      <p className="text-[12.5px] text-muted-foreground">{t('users.count', { count: filtered.length })}</p>

      {filtered.length === 0 ? (
        <p className="rounded-[18px] border border-border bg-card p-5 text-[14px] text-muted-foreground">
          {t('users.empty')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2" data-test-id="admin-users-list">
          {filtered.map((u) => {
            const name = u.name?.trim() || u.email
            const isBanned = banned(u)
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/menu/dashboard/admin/users/${u.id}`)}
                  data-test-id="admin-user-row"
                  className="flex w-full items-center gap-3 rounded-[14px] border border-border bg-card p-3 text-left transition-colors hover:border-primary/50"
                >
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary/10 font-heading text-[14px] font-bold text-primary"
                    aria-hidden="true"
                  >
                    {initialsOf(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-foreground">{name}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">{u.email}</span>
                  </span>
                  <span className="hidden shrink-0 text-right sm:block">
                    {isBanned ? (
                      <StatusPill tone="danger" label={t('users.banned')} />
                    ) : (
                      <span className="text-[12px] text-muted-foreground">
                        {t('users.tenants', { count: u.tenantCount })}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
