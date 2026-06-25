import Link from 'next/link'
import type { ReactNode } from 'react'
import type { MenuSummary } from '@iedora/product-menu/shared/api'

// Pure presentational building blocks shared across the admin restaurant detail
// / payments / edit surfaces. No server-only or interactivity deps, so BOTH
// server components (the pages) and client components (the payments panel) can
// import them. Tailwind over the dashboard's CSS-var tokens.

const CARD = 'rounded-[18px] border border-border bg-card'

/**
 * Compact card for a record rail / section: the title sits inside the padded
 * body with no header divider, optional action link on the right.
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
        <h2 className="font-heading text-[16px] font-bold text-foreground">{title}</h2>
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
export function EntityRow({ initials, name, sub }: { initials: string; name: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/10 font-heading text-[14px] font-bold text-primary">
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
  // Mobile-first: stack on phones, inline label · value on sm+.
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-[11px] last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="shrink-0 text-[14px] text-muted-foreground">{label}</span>
      <span className={`text-[14px] font-semibold break-words text-foreground sm:truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

/** Compact stat — label over a single bold number (the CRM stat strip). */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-[21px] font-bold tabular-nums tracking-[-0.3px] text-foreground">
        {value}
      </p>
    </div>
  )
}

/** Small muted section label inside a card (e.g. Owner / Tenant). */
export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </p>
  )
}

/**
 * One attribute row inside the Record-Details rail (Attio-style): a muted label
 * over its value (text or a rich node like a badge), with a hairline divider.
 */
export function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2.5 first:pt-0 last:border-0 last:pb-0">
      <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 text-[13.5px] font-medium text-foreground">{children}</div>
    </div>
  )
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'muted'

const STATUS_TONES: Record<StatusTone, { wrap: string; dot: string }> = {
  success: { wrap: 'bg-green-100 text-green-700', dot: 'bg-green-600' },
  warning: { wrap: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  danger: { wrap: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  muted: { wrap: 'text-muted-foreground', dot: 'bg-muted-foreground' },
}

export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  const c = STATUS_TONES[tone]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${c.wrap}`}
    >
      <span className={`size-1.5 rounded-full ${c.dot}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

/** Pill colour for an invoice status (paid / void / other). */
export function invoiceClass(status: string): string {
  if (status === 'paid') return 'bg-green-100 text-green-700'
  if (status === 'void') return 'bg-destructive/10 text-destructive'
  return 'bg-muted text-muted-foreground'
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

export function liveStatus(menus: MenuSummary[]): 'Live' | 'Draft' {
  return menus.some((m) => m.active) ? 'Live' : 'Draft'
}
