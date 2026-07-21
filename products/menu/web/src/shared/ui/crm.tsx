import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@iedora/ui/lib/utils'

/**
 * Shared CRM primitives for the dashboard home surfaces — the owner dashboard
 * and the staff admin overview render the same record-style cards so the two
 * read as one product. Token-based (dark/light safe) and built to stay legible
 * and tappable down to a 320px (iPhone 4) viewport.
 */

/**
 * A content panel — the CRM card chrome shared by every settings / form
 * section (theme editor, account settings). Same `rounded-[18px]` card token
 * as {@link StatCard}/{@link RecordCard}, with padding that tightens on a
 * phone so a 320px viewport never overflows. Pass `bare` to drop the inner
 * padding when the panel hosts full-bleed divided rows.
 */
export function Panel({
  children,
  className,
  bare,
  'data-test-id': testId,
}: {
  children: ReactNode
  className?: string
  bare?: boolean
  'data-test-id'?: string
}) {
  return (
    <section
      data-test-id={testId}
      className={cn(
        'rounded-[18px] border border-border bg-card',
        bare ? '' : 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </section>
  )
}

/** A panel heading: bold title + optional hint, on the CRM type scale. */
export function PanelHeader({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="font-heading text-[16px] font-bold leading-tight text-foreground">{title}</h2>
      {hint ? <p className="text-[13px] leading-[1.5] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Headline metric — a quiet label over a big tabular number (+ optional caption). */
export function StatCard({
  label,
  value,
  caption,
  'data-test-id': testId,
}: {
  label: ReactNode
  value: ReactNode
  caption?: ReactNode
  'data-test-id'?: string
}) {
  return (
    <div className="rounded-[18px] border border-border bg-card p-5" data-test-id={testId}>
      <p className="truncate text-[12.5px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-[26px] font-extrabold tabular-nums tracking-[-0.5px] text-foreground sm:text-[28px]">
        {value}
      </p>
      {caption ? <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{caption}</p> : null}
    </div>
  )
}

/** First-letter avatar tile (soft-primary), the CRM record glyph. */
export function RecordAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-[15px] font-bold text-primary',
        className,
      )}
      aria-hidden="true"
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

/**
 * A record card: avatar + linked title + subtitle, an optional trailing slot
 * (e.g. a metric or index), an optional `meta` line, and an optional `footer`
 * for quick actions. The whole header links to the record; footer actions are
 * their own links beneath a divider.
 */
export function RecordCard({
  titleHref,
  title,
  subtitle,
  trailing,
  meta,
  footer,
  'data-test-id': testId,
}: {
  titleHref: string
  title: string
  subtitle?: ReactNode
  trailing?: ReactNode
  meta?: ReactNode
  footer?: ReactNode
  'data-test-id'?: string
}) {
  return (
    <div className="flex h-full flex-col rounded-[18px] border border-border bg-card p-4" data-test-id={testId}>
      <div className="flex items-center gap-3">
        <RecordAvatar name={title} />
        <div className="min-w-0 flex-1">
          <Link
            href={titleHref}
            className="block truncate text-[15.5px] font-bold text-foreground no-underline transition-colors hover:text-primary"
          >
            {title}
          </Link>
          {subtitle ? <p className="truncate text-[12px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {trailing ? <div className="shrink-0 text-right">{trailing}</div> : null}
      </div>
      {meta ? <p className="mt-3 text-[12.5px] leading-[1.5] text-muted-foreground">{meta}</p> : null}
      {footer ? (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">{footer}</div>
      ) : null}
    </div>
  )
}

/**
 * Primary CTA rendered as a link — the header action on the owner dashboard
 * (new restaurant / upgrade) and the "manage" action in settings all share
 * this one pill so they never drift. `solid` is the filled brand button,
 * `outline` the quieter bordered variant.
 */
export function ActionButton({
  href,
  variant = 'solid',
  children,
  'data-test-id': testId,
}: {
  href: string
  variant?: 'solid' | 'outline'
  children: ReactNode
  'data-test-id'?: string
}) {
  return (
    <Link
      href={href}
      data-test-id={testId}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2 text-[13.5px] font-semibold no-underline transition-colors',
        variant === 'solid'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-border text-foreground hover:border-primary hover:text-primary',
      )}
    >
      {children}
    </Link>
  )
}

/** Quick-action button-link for a {@link RecordCard} footer — a big tap target. */
export function RecordAction({
  href,
  children,
  'data-test-id': testId,
}: {
  href: string
  children: ReactNode
  'data-test-id'?: string
}) {
  return (
    <Link
      href={href}
      data-test-id={testId}
      className="rounded-full border border-border px-2 py-2 text-center text-[13px] font-medium text-foreground no-underline transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </Link>
  )
}
