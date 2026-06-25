import type { ComponentProps, ReactNode } from 'react'
import { CheckIcon } from '@phosphor-icons/react/ssr'
import { Button } from '@iedora/ui/components/ui/button'
import { cn } from '@iedora/ui/lib/utils'

/** The shared section-heading type scale (both landing pages). */
const H2 = 'font-heading text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[36px]'

// Shared landing design language, used by BOTH the house (/house) and the menu
// product (/menu) pages so they read as one studio. Editorial: monospace
// section labels with hairline rules, soft-primary eyebrow pills, pill CTAs.
// Everything is token-based (dark/light safe) and 320px-safe (iPhone 4).

/** One max-width column with a responsive gutter that never overflows 320px. */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-[1080px] px-5 sm:px-8', className)} {...props} />
}

/** Monospace section head with an optional index and a hairline rule. */
export function SectionLabel({ index, children }: { index?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {index ? (
        <span className="font-mono text-[12px] font-semibold tracking-[0.16em] text-primary">{index}</span>
      ) : null}
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  )
}

/**
 * Handwritten-style accent — the "today's special" personality line. Italic
 * primary text with an optional hand-drawn underline squiggle. Use it for hero
 * kickers and small flourishes so the pages have a human, written-by-a-person
 * feel instead of a generic eyebrow pill.
 */
export function Accent({ children, underline = false }: { children: ReactNode; underline?: boolean }) {
  return (
    <span className="inline-flex flex-col items-start">
      <span className="font-heading text-[15px] font-semibold italic text-primary sm:text-[16px]">{children}</span>
      {underline ? (
        <svg width="64" height="7" viewBox="0 0 64 7" fill="none" className="mt-0.5 text-primary" aria-hidden="true">
          <path
            d="M2 4.5C11 1.5 21 6.5 32 4.5S53 1.5 62 4.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
    </span>
  )
}

const TAG_TONES = {
  live: 'bg-green-600/10 text-green-600',
  special: 'bg-amber-500/15 text-amber-600',
  primary: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
} as const

/** Small status/category pill (Live, Today's special, chef's pick, …). */
export function Tag({
  tone = 'muted',
  dot = false,
  children,
}: {
  tone?: keyof typeof TAG_TONES
  dot?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold',
        TAG_TONES[tone],
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

/** Pill CTA built on the shadcn Button (renders an anchor). */
export function CtaButton({
  href,
  children,
  full,
  variant = 'default',
}: {
  href: string
  children: ReactNode
  full?: boolean
  variant?: 'default' | 'secondary'
}) {
  return (
    <Button
      render={<a href={href} />}
      nativeButton={false}
      variant={variant}
      className={cn(
        'h-auto justify-center gap-2 rounded-full px-6 py-3 font-heading text-[15px] font-bold normal-case tracking-normal no-underline',
        full && 'w-full sm:w-auto',
      )}
    >
      {children}
    </Button>
  )
}

/** A content section: a full-width band + the shared column gutter. Pass a
 * `className` (e.g. `bg-muted`) for the band and `id`/`data-test-id` as usual. */
export function Section({
  children,
  className,
  containerClassName = 'py-12 sm:py-16',
  ...rest
}: ComponentProps<'section'> & { containerClassName?: string }) {
  return (
    <section className={className} {...rest}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  )
}

/** Mono eyebrow (optionally numbered) + the section heading. */
export function SectionHead({
  index,
  eyebrow,
  title,
  className,
}: {
  index?: string
  eyebrow: ReactNode
  title: ReactNode
  className?: string
}) {
  return (
    <>
      <SectionLabel index={index}>{eyebrow}</SectionLabel>
      <h2 className={cn('mt-4', H2, className)}>{title}</h2>
    </>
  )
}

/** Numbered steps (01 / 02 / 03…) as a divided list. */
export function Steps({ items }: { items: { title: string; desc: string }[] }) {
  return (
    <ol className="mt-7 flex flex-col divide-y divide-border border-y border-border">
      {items.map((s, i) => (
        <li key={s.title} className="flex items-start gap-4 py-5">
          <span className="font-mono text-[14px] font-bold text-primary">
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <h3 className="font-heading text-[18px] font-bold">{s.title}</h3>
            <p className="mt-1 text-[14.5px] leading-[1.5] text-muted-foreground">{s.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Two-column check list (beliefs / features). `bordered` adds row dividers. */
export function CheckList({ items, bordered }: { items: ReactNode[]; bordered?: boolean }) {
  return (
    <ul className={cn('mt-7 grid gap-x-8 sm:grid-cols-2', bordered ? '' : 'gap-y-3.5')}>
      {items.map((item, i) => (
        <li
          key={i}
          className={cn('flex items-start gap-3', bordered && 'items-center border-b border-border py-2.5')}
        >
          <CheckIcon size={18} weight="bold" className="mt-0.5 shrink-0 text-primary" />
          <span className="text-[15px] font-medium leading-[1.45] sm:text-[16px]">{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Inverted "spotlight" band (dark in light mode, light in dark): mono eyebrow +
 * heading + content. Used for the multilingual / specials bands. */
export function InvertedBand({
  eyebrow,
  title,
  children,
  className,
  ...rest
}: ComponentProps<'section'> & { eyebrow: ReactNode; title: ReactNode }) {
  return (
    <section className={cn('bg-foreground text-background', className)} {...rest}>
      <Container className="py-12 text-center sm:py-16">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-background/60">
          {eyebrow}
        </span>
        <h2 className={cn('mx-auto mt-3 max-w-[18ch]', H2)}>{title}</h2>
        {children}
      </Container>
    </section>
  )
}

/** Primary CTA band: heading + optional subtitle + actions (children). */
export function CtaBand({
  title,
  subtitle,
  children,
  className,
  ...rest
}: ComponentProps<'section'> & { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <section className={cn('bg-primary text-primary-foreground', className)} {...rest}>
      <Container className="flex flex-col items-center py-16 text-center sm:py-24">
        <h2 className="max-w-[18ch] font-heading text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[44px]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mx-auto mt-3 max-w-[46ch] text-[16px] leading-[1.5] text-primary-foreground/90">
            {subtitle}
          </p>
        ) : null}
        <div className="mt-7 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">{children}</div>
      </Container>
    </section>
  )
}
