import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { isPlanCode } from '@iedora/product-menu/features/plans'
import type { AuditRecord, Invoice, MenuSummary } from '@iedora/product-menu/shared/api'

/** Resolves plan display names from the i18n `Billing.plans.<code>.name` source —
 * the SAME one the tenant billing page renders — so admin labels can never drift
 * from product copy. Locale-aware (the request locale), with the "free" annotation
 * translated from `Admin.plans.freeSuffix`. Returns a sync labeller the pages +
 * InvoiceList call. */
export async function planNamer(): Promise<(code: string | undefined) => string> {
  const [tb, ta] = await Promise.all([getTranslations('Billing'), getTranslations('Admin')])
  return (code) =>
    code && isPlanCode(code)
      ? tb(`plans.${code}.name`)
      : `${tb('plans.menu_free.name')} ${ta('plans.freeSuffix')}`
}

// Presentational building blocks shared by the admin restaurant detail /
// payments / edit pages. Server components (no interactivity) — tailwind over
// the dashboard's CSS-var tokens (card/border/foreground/muted/primary/green).

const CARD = 'rounded-[18px] border border-border bg-card'

export function AdminCard({
  title,
  action,
  children,
  ...rest
}: {
  title: string
  action?: { href: string; label: string }
  children: ReactNode
} & { 'data-test-id'?: string }) {
  return (
    <section className={CARD} {...rest}>
      <header className="flex items-center justify-between border-b border-border px-[18px] py-[14px]">
        <h2 className="font-[family-name:var(--display)] text-[16px] font-bold text-foreground">{title}</h2>
        {action && (
          <Link href={action.href} className="text-[13px] font-semibold text-primary">
            {action.label}
          </Link>
        )}
      </header>
      <div className="px-[18px] py-1">{children}</div>
    </section>
  )
}

/**
 * Compact card for the detail page's right rail (Pencil "Owner / Tenant /
 * Payments / QR code"): the title sits inside the padded body with no
 * header divider, optional action link on the right.
 */
export function SideCard({
  title,
  action,
  children,
  ...rest
}: {
  title: string
  action?: { href: string; label: string; external?: boolean }
  children: ReactNode
} & { 'data-test-id'?: string }) {
  return (
    <section className={`${CARD} p-[18px]`} {...rest}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--display)] text-[16px] font-bold text-foreground">{title}</h2>
        {action && (
          <Link
            href={action.href}
            target={action.external ? '_blank' : undefined}
            rel={action.external ? 'noopener' : undefined}
            className="shrink-0 text-[13px] font-semibold text-primary"
          >
            {action.label}
          </Link>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Avatar + name + sub line — the Owner / Tenant identity row. */
export function EntityRow({
  initials,
  name,
  sub,
}: {
  initials: string
  name: string
  sub: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--cinnabar-soft)] font-[family-name:var(--display)] text-[14px] font-bold text-primary">
        {initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-foreground">{name}</p>
        <p className="truncate text-[12px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}

/** Two-letter initials from a display name (word-initials, else first two chars). */
export function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  return ((words[0] ?? '?').slice(0, 2) || '?').toUpperCase()
}

export function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-[11px] last:border-b-0">
      <span className="shrink-0 text-[14px] text-muted-foreground">{label}</span>
      <span className={`truncate text-[14px] font-semibold text-foreground ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${CARD} p-[18px]`}>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-[family-name:var(--display)] text-[26px] font-extrabold tracking-[-0.5px] text-foreground">
        {value}
      </p>
    </div>
  )
}

export function AdminButton({
  href,
  children,
  target,
  rel,
}: {
  href: string
  children: ReactNode
  target?: string
  rel?: string
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-2 text-[14px] font-semibold text-foreground transition-colors hover:border-foreground"
    >
      {children}
    </Link>
  )
}

export function StatusPill({ live, label }: { live: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={
        live
          ? { color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 12%, transparent)' }
          : undefined
      }
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: live ? 'var(--green)' : 'var(--muted-foreground)' }}
        aria-hidden="true"
      />
      <span className={live ? '' : 'text-muted-foreground'}>{label}</span>
    </span>
  )
}

// Maps the service's audit action codes onto `Admin.audit.<key>` i18n keys.
const AUDIT_KEYS: Record<string, string> = {
  'menu.restaurant.created': 'created',
  'menu.restaurant.slug_renamed': 'slugRenamed',
  'menu.restaurant.deleted': 'deleted',
  'billing.subscription.created': 'subscriptionCreated',
}

export async function AuditList({ events }: { events: AuditRecord[] }) {
  const t = await getTranslations('Admin')
  if (events.length === 0) {
    return <p className="py-3 text-[14px] text-muted-foreground">{t('audit.noActivity')}</p>
  }
  return (
    <ul data-test-id="admin-audit-list">
      {events.map((e) => {
        const key = AUDIT_KEYS[e.action]
        return (
          <li
            key={e.id}
            className="flex items-center justify-between gap-3 border-b border-border py-[11px] last:border-b-0"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-foreground">
                {key ? t(`audit.${key}`) : e.action}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {(e.actorId ?? e.actorType) + ' · ' + e.source}
              </p>
            </div>
            <time className="shrink-0 text-[12px] text-muted-foreground">{formatRelative(e.at)}</time>
          </li>
        )
      })}
    </ul>
  )
}

export async function InvoiceList({
  invoices,
  planName,
}: {
  invoices: Invoice[]
  planName: (code: string | undefined) => string
}) {
  const t = await getTranslations('Admin')
  if (invoices.length === 0) {
    return <p className="py-3 text-[14px] text-muted-foreground">{t('payments.noInvoices')}</p>
  }
  return (
    <ul data-test-id="admin-invoice-list">
      {invoices.map((inv) => (
        <li
          key={inv.id}
          className="flex items-center justify-between gap-3 border-b border-border py-[12px] last:border-b-0"
        >
          <div>
            <p className="text-[14px] font-medium text-foreground">{formatDate(inv.createdAt)}</p>
            <p className="text-[12px] text-muted-foreground">{planName(inv.planCode)}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-bold text-foreground">
              {formatMoney(inv.amountCents, inv.currency)}
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize"
              style={invoiceStyle(inv.status)}
            >
              {inv.status}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function invoiceStyle(status: string): { color: string; background: string } {
  if (status === 'paid')
    return { color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 12%, transparent)' }
  if (status === 'void')
    return { color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }
  return { color: 'var(--muted-foreground)', background: 'var(--muted)' }
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (Number.isNaN(diff)) return ''
  const days = Math.floor(diff / 86_400_000)
  if (days <= 0) {
    const h = Math.floor(diff / 3_600_000)
    return h <= 0 ? 'just now' : `${h}h`
  }
  if (days < 30) return `${days}d`
  return formatDate(iso)
}


export function liveStatus(menus: MenuSummary[]): 'Live' | 'Draft' {
  return menus.some((m) => m.active) ? 'Live' : 'Draft'
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100)
}
