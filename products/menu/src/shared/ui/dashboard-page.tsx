import * as React from 'react'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbHere,
  BreadcrumbLink,
} from '@iedora/design-system'

/**
 * Standard shell for every dashboard page.
 *
 * Why one shell:
 *   - Every page was hand-rolling its own breadcrumb (inline `<h1>` with
 *     "Back" link) AND repeating its own `space-y-{6|8|10}` rhythm, which
 *     drifted from screen to screen. One primitive, one rhythm.
 *   - The first crumb is ALWAYS "Home" pointing at /dashboard — "Back"
 *     is contextual and confusing on routes accessed via shared link.
 *   - `<BreadcrumbHere>` doubles as the page's `<h1>` (SEO + a11y) so
 *     the title slot writes one piece of text, not two.
 *
 * Shape:
 *
 *   <DashboardPage
 *     title="QR codes (admin)"
 *     crumbs={[{ label: 'Admin', href: '/dashboard/admin' }]}
 *     actions={<Link href="…">New</Link>}
 *     data-test-id="qr-codes-admin"
 *   >
 *     {…sections…}
 *   </DashboardPage>
 *
 *   ↓
 *
 *   HOME / ADMIN / *QR codes (admin)*                      [actions]
 *   (optional eyebrow + description)
 *
 *   …children…
 *
 * Pass `crumbs={[]}` (or omit) when the page IS the root (e.g.
 * `/dashboard`). Then the title renders as a plain `<h1>` with no
 * trail above it — Home pointing at itself would be redundant.
 *
 * Mobile-first: the header row collapses (actions wrap below at narrow
 * widths), and the children rhythm stays consistent at `space-y-10`.
 */

export type DashboardCrumb = {
  label: React.ReactNode
  href: string
  /** Used for the per-crumb data-test-id suffix. Falls back to index. */
  testId?: string
}

export type DashboardPageProps = {
  /**
   * Intermediate breadcrumb items between Home and the current page.
   * Home is prepended automatically. Defaults to `[]` so a page like
   * `/dashboard/billing` just renders `HOME / Billing`.
   */
  crumbs?: ReadonlyArray<DashboardCrumb>
  /**
   * When true, no breadcrumb is rendered (the title becomes a plain
   * `<h1>`). Use on the `/dashboard` root — a "Home" link that points
   * at the current page would just be noise.
   */
  root?: boolean
  /** Renders as <BreadcrumbHere> (h1). The page heading. */
  title: React.ReactNode
  /** Optional mono-caps line above the heading row. */
  eyebrow?: React.ReactNode
  /** Optional editorial paragraph under the heading row. */
  description?: React.ReactNode
  /** Right-aligned slot for primary actions (links, buttons, filters). */
  actions?: React.ReactNode
  /** Page sections. Spaced via the page's own `space-y-10` rhythm. */
  children: React.ReactNode
  /** Forwarded to the outer wrapper + namespaces all auto test-ids. */
  'data-test-id'?: string
}

export function DashboardPage({
  crumbs = [],
  root = false,
  title,
  eyebrow,
  description,
  actions,
  children,
  'data-test-id': testId,
}: DashboardPageProps) {
  const ns = (suffix: string) => (testId ? `${testId}-${suffix}` : undefined)
  const showHeaderRow = Boolean(eyebrow || description || actions)

  return (
    <div className="space-y-10" data-test-id={testId}>
      {root ? (
        // Root page (`/dashboard`): no breadcrumb trail above the
        // heading — a Home link pointing at the current page is noise.
        // Render the title as `<h1>` styled like `BreadcrumbHere` so
        // the typography matches the rest of the dashboard surfaces.
        <h1
          className="ds-breadcrumb__here"
          data-test-id={ns('heading')}
        >
          {title}
        </h1>
      ) : (
        <Breadcrumb data-test-id={ns('breadcrumbs')}>
          <BreadcrumbLink asChild data-test-id={ns('breadcrumb-home')}>
            <Link href="/dashboard">Home</Link>
          </BreadcrumbLink>
          {crumbs.map((c, i) => (
            <BreadcrumbLink
              key={c.href}
              asChild
              data-test-id={ns(`breadcrumb-${c.testId ?? i}`)}
            >
              <Link href={c.href}>{c.label}</Link>
            </BreadcrumbLink>
          ))}
          <BreadcrumbHere data-test-id={ns('breadcrumb-current')}>
            {title}
          </BreadcrumbHere>
        </Breadcrumb>
      )}

      {showHeaderRow && (
        <header
          className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
          data-test-id={ns('header')}
        >
          <div className="space-y-2 min-w-0">
            {eyebrow ? (
              <div className="eyebrow" data-test-id={ns('eyebrow')}>
                {eyebrow}
              </div>
            ) : null}
            {description ? (
              <p
                className="max-w-prose text-sm text-[var(--ink-70)]"
                data-test-id={ns('description')}
              >
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div
              className="flex flex-wrap items-center gap-3 sm:justify-end"
              data-test-id={ns('actions')}
            >
              {actions}
            </div>
          ) : null}
        </header>
      )}

      {children}
    </div>
  )
}
