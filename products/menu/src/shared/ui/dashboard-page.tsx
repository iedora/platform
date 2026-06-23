import * as React from 'react'

/**
 * Standard shell for every dashboard page.
 *
 * One primitive, one rhythm: a single bold page title (the Pencil design
 * has no editorial "Parent / Page" breadcrumb trail — the sidebar +
 * bottom nav already carry location), an optional eyebrow / description /
 * actions row, then the page sections.
 *
 *     <DashboardPage title="Billing" data-test-id="billing">
 *       …sections…
 *     </DashboardPage>
 *
 * Mobile-first: the header row collapses (actions wrap below at narrow
 * widths) and the children rhythm stays consistent.
 */

export type DashboardPageProps = {
  /** The page heading, rendered as the bold <h1>. */
  title: React.ReactNode
  /** Optional mono-caps line above the heading row. */
  eyebrow?: React.ReactNode
  /** Optional editorial paragraph under the heading row. */
  description?: React.ReactNode
  /** Right-aligned slot for primary actions (links, buttons, filters). */
  actions?: React.ReactNode
  /**
   * Visual header chrome.
   *   - 'standard' (default): breadcrumb / h1 + optional eyebrow /
   *     description / actions row.
   *   - 'none': no visible header at all. The title is still rendered
   *     in a visually-hidden `<h1>` for a11y + SEO, but the page
   *     content claims the full vertical space. Use sparingly — only
   *     for surfaces where the content provides its own navigation
   *     (e.g. the menu builder's sticky chip nav).
   */
  chrome?: 'standard' | 'none'
  /** Page sections. */
  children: React.ReactNode
  /** Forwarded to the outer wrapper + namespaces all auto test-ids. */
  'data-test-id'?: string
}

export function DashboardPage({
  title,
  eyebrow,
  description,
  actions,
  chrome = 'standard',
  children,
  'data-test-id': testId,
}: DashboardPageProps) {
  const ns = (suffix: string) => (testId ? `${testId}-${suffix}` : undefined)
  const showHeaderRow = Boolean(eyebrow || description || actions)

  if (chrome === 'none') {
    // Bare mode: the page's own content owns the top of the viewport.
    // We still emit an `<h1>` for screen readers + page outlining, just
    // visually hidden. Outer rhythm is `space-y-3` (12px) — tight
    // enough to feel content-forward on a phone, big enough that
    // adjacent top-level sections don't visually fuse.
    return (
      <div className="space-y-3" data-test-id={testId}>
        <h1 className="sr-only" data-test-id={ns('heading')}>
          {title}
        </h1>
        {children}
      </div>
    )
  }

  return (
    <div className="space-y-6" data-test-id={testId}>
      <div className="space-y-4">
        {/* A single bold page title — no breadcrumb trail (Pencil). */}
        <h1
          className="font-heading text-2xl font-bold leading-[1.15] tracking-[-0.01em] text-foreground"
          data-test-id={ns('heading')}
        >
          {title}
        </h1>

        {showHeaderRow && (
          <header
            className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
            data-test-id={ns('header')}
          >
            <div className="space-y-2 min-w-0">
              {eyebrow ? (
                <div
                  className="inline-block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                  data-test-id={ns('eyebrow')}
                >
                  {eyebrow}
                </div>
              ) : null}
              {description ? (
                <p
                  className="max-w-prose text-sm text-foreground"
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
      </div>

      <div className="space-y-10 sm:space-y-12">
        {children}
      </div>
    </div>
  )
}
