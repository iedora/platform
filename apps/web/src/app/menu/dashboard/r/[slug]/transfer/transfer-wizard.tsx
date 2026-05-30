'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  searchTenantsAction,
  searchUsersAction,
  transferRestaurantAction,
  type TenantOption,
  type UserOption,
  type TransferActionInput,
} from './actions'

/**
 * Three-section vertical form. Mobile-first: every input + tap target
 * spans the full row, sections stack with a generous gap, and the
 * confirm CTA sticks to the bottom so it's always reachable on a phone.
 *
 *   §1 Tenant     pick existing OR type a new name
 *   §2 Owner      pick existing user OR fill (email, name, password)
 *   §3 Confirm    sticky bottom button; disabled until both picks set
 *
 * Search inputs trigger server actions on every keystroke (debounced
 * via the input's native `onChange` + a transition). Admin scope ≪ 100
 * tenants/users locally, so we don't need infinite scroll yet.
 */
type TargetTenant =
  | { kind: 'existing'; option: TenantOption }
  | { kind: 'new'; name: string }
  | null

type TargetOwner =
  | { kind: 'existing'; option: UserOption }
  | { kind: 'new'; email: string; name: string; password: string }
  | null

export function TransferWizard({
  slug,
  restaurantName,
}: {
  slug: string
  restaurantName: string
}) {
  const t = useTranslations('RestaurantTransfer')
  const [tenant, setTenant] = useState<TargetTenant>(null)
  const [owner, setOwner] = useState<TargetOwner>(null)
  const [submitting, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const ready = tenantReady(tenant) && ownerReady(owner)

  function onConfirm() {
    if (!ready || !tenant || !owner) return
    setError(null)
    startTransition(async () => {
      const payload: TransferActionInput = {
        slug,
        target:
          tenant.kind === 'existing'
            ? { kind: 'existing-tenant', tenantId: tenant.option.id }
            : { kind: 'new-tenant', name: tenant.name.trim() },
        owner:
          owner.kind === 'existing'
            ? { kind: 'existing-user', userId: owner.option.id }
            : {
                kind: 'new-user',
                email: owner.email.trim(),
                name: owner.name.trim(),
                password: owner.password,
              },
      }
      const res = await transferRestaurantAction(payload)
      if (!res.ok) setError(res.error)
      // Success → server action redirects to /menu/dashboard.
    })
  }

  return (
    <div
      className="space-y-10 pb-32"
      data-test-id="transfer-wizard"
    >
      <TenantSection value={tenant} onChange={setTenant} />
      <OwnerSection value={owner} onChange={setOwner} />
      <ConfirmSummary
        restaurantName={restaurantName}
        tenant={tenant}
        owner={owner}
      />

      {error && (
        <p
          className="rounded border border-[var(--cinnabar)] bg-[var(--cinnabar-15)] px-4 py-3 text-sm text-[var(--cinnabar)]"
          data-test-id="transfer-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Sticky CTA — sits above the mobile sidebar trigger via z-10.
          Padding picks up the iPhone home-indicator inset so the button
          isn't under it. */}
      <div
        className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--ink-14)] bg-[var(--paper)]/95 px-4 py-3 backdrop-blur lg:left-72"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={onConfirm}
          disabled={!ready || submitting}
          className="w-full rounded bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-[var(--paper)] disabled:opacity-40"
          data-test-id="transfer-submit"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
      </div>
    </div>
  )
}

function tenantReady(t: TargetTenant): boolean {
  if (!t) return false
  if (t.kind === 'existing') return true
  return t.name.trim().length > 0
}

function ownerReady(o: TargetOwner): boolean {
  if (!o) return false
  if (o.kind === 'existing') return true
  return (
    o.email.trim().length > 3 &&
    o.name.trim().length > 0 &&
    o.password.length >= 12
  )
}

// ── Tenant section ─────────────────────────────────────────────────

function TenantSection({
  value,
  onChange,
}: {
  value: TargetTenant
  onChange: (v: TargetTenant) => void
}) {
  const t = useTranslations('RestaurantTransfer')
  const [mode, setMode] = useState<'existing' | 'new'>(
    value?.kind === 'new' ? 'new' : 'existing',
  )
  return (
    <section
      className="space-y-4"
      aria-labelledby="transfer-tenant-heading"
      data-test-id="transfer-tenant-section"
    >
      <header>
        <h2
          id="transfer-tenant-heading"
          className="font-[family-name:var(--serif)] text-xl"
        >
          {t('tenantHeading')}
        </h2>
        <p className="text-sm text-[var(--ink-55)]">
          {t('tenantHint')}
        </p>
      </header>

      <ModeToggle
        mode={mode}
        onChange={(next) => {
          setMode(next)
          onChange(null)
        }}
        existingLabel={t('pickExistingTenant')}
        newLabel={t('createTenant')}
        testId="transfer-tenant-mode"
      />

      {mode === 'existing' ? (
        <TenantPicker value={value} onChange={onChange} />
      ) : (
        <NewTenantInput value={value} onChange={onChange} />
      )}
    </section>
  )
}

function TenantPicker({
  value,
  onChange,
}: {
  value: TargetTenant
  onChange: (v: TargetTenant) => void
}) {
  const t = useTranslations('RestaurantTransfer')
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<TenantOption[]>([])
  const [searching, startTransition] = useTransition()

  function runSearch(q: string) {
    setQuery(q)
    startTransition(async () => {
      const rows = await searchTenantsAction(q)
      setOptions(rows)
    })
  }

  // Lazy first load on focus so the page render isn't blocked on a
  // search the user may not need (they might know the tenant name).
  function ensureLoaded() {
    if (options.length === 0 && !searching) runSearch('')
  }

  const selectedId =
    value?.kind === 'existing' ? value.option.id : null

  return (
    <div className="space-y-3">
      <input
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        aria-label={t('tenantSearchPlaceholder')}
        placeholder={t('tenantSearchPlaceholder')}
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        onFocus={ensureLoaded}
        className="w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ink-40)]"
        data-test-id="transfer-tenant-search"
      />
      <ul
        className="divide-y divide-[var(--ink-14)] border border-[var(--ink-14)] rounded"
        data-test-id="transfer-tenant-list"
      >
        {options.length === 0 && (
          <li className="px-3 py-4 text-sm text-[var(--ink-55)]">
            {searching ? t('searching') : t('emptyList')}
          </li>
        )}
        {options.map((o) => {
          const active = selectedId === o.id
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() =>
                  onChange({ kind: 'existing', option: o })
                }
                aria-pressed={active}
                className={`flex w-full items-center justify-between px-3 py-3 text-left text-sm ${
                  active
                    ? 'bg-[var(--ink-08)]'
                    : 'hover:bg-[var(--paper-2)]'
                }`}
                data-test-id={`transfer-tenant-option-${o.id}`}
              >
                <span className="truncate">{o.name}</span>
                {active && (
                  <span className="ml-2 text-xs text-[var(--ink-55)]">
                    ✓
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function NewTenantInput({
  value,
  onChange,
}: {
  value: TargetTenant
  onChange: (v: TargetTenant) => void
}) {
  const t = useTranslations('RestaurantTransfer')
  const name = value?.kind === 'new' ? value.name : ''
  return (
    <div className="space-y-2">
      <label
        htmlFor="transfer-new-tenant-name"
        className="block text-xs uppercase tracking-[0.18em] text-[var(--ink-55)]"
      >
        {t('tenantNameLabel')}
      </label>
      <input
        id="transfer-new-tenant-name"
        type="text"
        autoComplete="organization"
        placeholder={t('tenantNamePlaceholder')}
        value={name}
        onChange={(e) =>
          onChange({ kind: 'new', name: e.target.value })
        }
        className="w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ink-40)]"
        data-test-id="transfer-tenant-new-name"
      />
    </div>
  )
}

// ── Owner section ──────────────────────────────────────────────────

function OwnerSection({
  value,
  onChange,
}: {
  value: TargetOwner
  onChange: (v: TargetOwner) => void
}) {
  const t = useTranslations('RestaurantTransfer')
  const [mode, setMode] = useState<'existing' | 'new'>(
    value?.kind === 'new' ? 'new' : 'existing',
  )
  return (
    <section
      className="space-y-4"
      aria-labelledby="transfer-owner-heading"
      data-test-id="transfer-owner-section"
    >
      <header>
        <h2
          id="transfer-owner-heading"
          className="font-[family-name:var(--serif)] text-xl"
        >
          {t('ownerHeading')}
        </h2>
        <p className="text-sm text-[var(--ink-55)]">
          {t('ownerHint')}
        </p>
      </header>

      <ModeToggle
        mode={mode}
        onChange={(next) => {
          setMode(next)
          onChange(null)
        }}
        existingLabel={t('pickExistingUser')}
        newLabel={t('createUser')}
        testId="transfer-owner-mode"
      />

      {mode === 'existing' ? (
        <UserPicker value={value} onChange={onChange} />
      ) : (
        <NewUserForm value={value} onChange={onChange} />
      )}
    </section>
  )
}

function UserPicker({
  value,
  onChange,
}: {
  value: TargetOwner
  onChange: (v: TargetOwner) => void
}) {
  const t = useTranslations('RestaurantTransfer')
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<UserOption[]>([])
  const [searching, startTransition] = useTransition()

  function runSearch(q: string) {
    setQuery(q)
    startTransition(async () => {
      const rows = await searchUsersAction(q)
      setOptions(rows)
    })
  }

  function ensureLoaded() {
    if (options.length === 0 && !searching) runSearch('')
  }

  const selectedId =
    value?.kind === 'existing' ? value.option.id : null

  return (
    <div className="space-y-3">
      <input
        type="search"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        aria-label={t('userSearchPlaceholder')}
        placeholder={t('userSearchPlaceholder')}
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        onFocus={ensureLoaded}
        className="w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ink-40)]"
        data-test-id="transfer-owner-search"
      />
      <ul
        className="divide-y divide-[var(--ink-14)] border border-[var(--ink-14)] rounded"
        data-test-id="transfer-owner-list"
      >
        {options.length === 0 && (
          <li className="px-3 py-4 text-sm text-[var(--ink-55)]">
            {searching ? t('searching') : t('emptyList')}
          </li>
        )}
        {options.map((o) => {
          const active = selectedId === o.id
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() =>
                  onChange({ kind: 'existing', option: o })
                }
                aria-pressed={active}
                className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm ${
                  active
                    ? 'bg-[var(--ink-08)]'
                    : 'hover:bg-[var(--paper-2)]'
                }`}
                data-test-id={`transfer-owner-option-${o.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate">{o.name || o.email}</p>
                  {o.name && (
                    <p className="truncate text-xs text-[var(--ink-55)]">
                      {o.email}
                    </p>
                  )}
                </div>
                {o.staff && (
                  <span className="shrink-0 border border-[var(--ink-40)] px-1 text-[9px] uppercase tracking-[0.18em] text-[var(--ink-55)]">
                    {t('staffMarker')}
                  </span>
                )}
                {active && (
                  <span className="ml-2 text-xs text-[var(--ink-55)]">
                    ✓
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function NewUserForm({
  value,
  onChange,
}: {
  value: TargetOwner
  onChange: (v: TargetOwner) => void
}) {
  const t = useTranslations('RestaurantTransfer')
  const v =
    value?.kind === 'new' ? value : { email: '', name: '', password: '' }
  function patch(p: Partial<{ email: string; name: string; password: string }>) {
    onChange({ kind: 'new', email: v.email, name: v.name, password: v.password, ...p })
  }
  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="transfer-new-user-email"
          className="block text-xs uppercase tracking-[0.18em] text-[var(--ink-55)]"
        >
          {t('userEmailLabel')}
        </label>
        <input
          id="transfer-new-user-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          value={v.email}
          onChange={(e) => patch({ email: e.target.value })}
          className="mt-2 w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ink-40)]"
          data-test-id="transfer-owner-new-email"
        />
      </div>
      <div>
        <label
          htmlFor="transfer-new-user-name"
          className="block text-xs uppercase tracking-[0.18em] text-[var(--ink-55)]"
        >
          {t('userNameLabel')}
        </label>
        <input
          id="transfer-new-user-name"
          type="text"
          autoComplete="name"
          value={v.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="mt-2 w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ink-40)]"
          data-test-id="transfer-owner-new-name"
        />
      </div>
      <div>
        <label
          htmlFor="transfer-new-user-password"
          className="block text-xs uppercase tracking-[0.18em] text-[var(--ink-55)]"
        >
          {t('userPasswordLabel')}
        </label>
        <input
          id="transfer-new-user-password"
          type="text"
          autoComplete="off"
          value={v.password}
          onChange={(e) => patch({ password: e.target.value })}
          className="mt-2 w-full rounded border border-[var(--ink-14)] bg-transparent px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ink-40)]"
          data-test-id="transfer-owner-new-password"
        />
        <p className="mt-1 text-xs text-[var(--ink-55)]">
          {t('userPasswordHint')}
        </p>
      </div>
    </div>
  )
}

// ── Confirm ────────────────────────────────────────────────────────

function ConfirmSummary({
  restaurantName,
  tenant,
  owner,
}: {
  restaurantName: string
  tenant: TargetTenant
  owner: TargetOwner
}) {
  const t = useTranslations('RestaurantTransfer')
  const tenantLabel =
    tenant?.kind === 'existing'
      ? tenant.option.name
      : tenant?.kind === 'new'
        ? `${tenant.name.trim()} ${t('newSuffix')}`
        : t('pendingTenant')

  const ownerLabel =
    owner?.kind === 'existing'
      ? owner.option.email
      : owner?.kind === 'new'
        ? `${owner.email.trim()} ${t('newSuffix')}`
        : t('pendingOwner')

  return (
    <section
      className="space-y-4 rounded border border-[var(--ink-14)] bg-[var(--paper-2)] p-4"
      aria-labelledby="transfer-confirm-heading"
      data-test-id="transfer-confirm-section"
    >
      <h2
        id="transfer-confirm-heading"
        className="font-[family-name:var(--serif)] text-xl"
      >
        {t('confirmHeading')}
      </h2>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--ink-55)]">{t('rowRestaurant')}</dt>
          <dd className="truncate text-right">{restaurantName}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--ink-55)]">{t('rowTenant')}</dt>
          <dd className="truncate text-right">{tenantLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--ink-55)]">{t('rowOwner')}</dt>
          <dd className="truncate text-right">{ownerLabel}</dd>
        </div>
      </dl>
      <p className="text-xs text-[var(--ink-55)]">
        {t('handoffNotice')}
      </p>
    </section>
  )
}

// ── Mode toggle (existing | new) ──────────────────────────────────

function ModeToggle({
  mode,
  onChange,
  existingLabel,
  newLabel,
  testId,
}: {
  mode: 'existing' | 'new'
  onChange: (m: 'existing' | 'new') => void
  existingLabel: string
  newLabel: string
  testId: string
}) {
  return (
    <div
      role="tablist"
      className="grid grid-cols-2 gap-2"
      data-test-id={testId}
    >
      <ToggleButton
        active={mode === 'existing'}
        label={existingLabel}
        onClick={() => onChange('existing')}
        testId={`${testId}-existing`}
      />
      <ToggleButton
        active={mode === 'new'}
        label={newLabel}
        onClick={() => onChange('new')}
        testId={`${testId}-new`}
      />
    </div>
  )
}

function ToggleButton({
  active,
  label,
  onClick,
  testId,
}: {
  active: boolean
  label: string
  onClick: () => void
  testId: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded border px-3 py-3 text-sm ${
        active
          ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
          : 'border-[var(--ink-14)] bg-transparent text-[var(--ink)]'
      }`}
      data-test-id={testId}
    >
      {label}
    </button>
  )
}
