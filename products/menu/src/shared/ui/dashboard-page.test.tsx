// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DashboardPage } from './dashboard-page'

describe('DashboardPage', () => {
  it('renders title as a plain <h1> when `root` is true (no breadcrumb)', () => {
    const html = renderToStaticMarkup(
      <DashboardPage root title="Menus" data-test-id="dashboard-root">
        <div>content</div>
      </DashboardPage>,
    )
    expect(html).toMatch(/<h1[^>]*class="ds-breadcrumb__here"/)
    expect(html).toContain('data-test-id="dashboard-root-heading"')
    expect(html).toContain('>Menus</h1>')
    expect(html).not.toContain('aria-label="Breadcrumb"')
  })

  it('always renders Home + current breadcrumb on non-root pages, even with no intermediate crumbs', () => {
    const html = renderToStaticMarkup(
      <DashboardPage title="Billing" data-test-id="billing">
        <div />
      </DashboardPage>,
    )
    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('data-test-id="billing-breadcrumbs"')
    expect(html).toContain('data-test-id="billing-breadcrumb-home"')
    expect(html).toContain('href="/dashboard"')
    expect(html).toContain('>Home</a>')
    expect(html).toContain('data-test-id="billing-breadcrumb-current"')
    expect(html).toMatch(/<h1[^>]*aria-current="page"/)
    expect(html).toContain('>Billing</h1>')
  })

  it('prepends Home, renders intermediates, and the current as h1', () => {
    const html = renderToStaticMarkup(
      <DashboardPage
        title="QR Code"
        data-test-id="qr"
        crumbs={[
          { label: 'Tasca do Avô', href: '/dashboard/r/tasca', testId: 'restaurant' },
        ]}
      >
        <div />
      </DashboardPage>,
    )
    expect(html).toContain('data-test-id="qr-breadcrumb-home"')
    expect(html).toContain('data-test-id="qr-breadcrumb-restaurant"')
    expect(html).toContain('href="/dashboard/r/tasca"')
    expect(html).toContain('>Tasca do Avô</a>')
    expect(html).toContain('data-test-id="qr-breadcrumb-current"')
    expect(html).toContain('>QR Code</h1>')
  })

  it('falls back to index when a crumb has no testId', () => {
    const html = renderToStaticMarkup(
      <DashboardPage
        title="X"
        data-test-id="x"
        crumbs={[
          { label: 'A', href: '/a' },
          { label: 'B', href: '/b' },
        ]}
      >
        {null}
      </DashboardPage>,
    )
    expect(html).toContain('data-test-id="x-breadcrumb-0"')
    expect(html).toContain('data-test-id="x-breadcrumb-1"')
  })

  it('renders eyebrow + description + actions in the header row only when supplied', () => {
    const html = renderToStaticMarkup(
      <DashboardPage
        root
        title="Analytics"
        data-test-id="analytics"
        eyebrow="this month"
        description="A quiet measure of the room."
        actions={<button data-test-id="analytics-range">7d</button>}
      >
        <div />
      </DashboardPage>,
    )
    expect(html).toContain('data-test-id="analytics-header"')
    expect(html).toContain('data-test-id="analytics-eyebrow"')
    expect(html).toContain('data-test-id="analytics-description"')
    expect(html).toContain('data-test-id="analytics-actions"')
    expect(html).toContain('>this month</div>')
    expect(html).toContain('A quiet measure of the room.')
    expect(html).toContain('data-test-id="analytics-range"')
  })

  it('omits the header row entirely when no eyebrow/description/actions are supplied', () => {
    const html = renderToStaticMarkup(
      <DashboardPage root title="X" data-test-id="x">
        <div />
      </DashboardPage>,
    )
    expect(html).not.toContain('data-test-id="x-header"')
  })

  it('forwards data-test-id to the outer wrapper', () => {
    const html = renderToStaticMarkup(
      <DashboardPage root title="X" data-test-id="my-page">
        <div />
      </DashboardPage>,
    )
    expect(html).toMatch(/^<div[^>]*data-test-id="my-page"/)
  })

  it('applies the standard space-y-10 rhythm', () => {
    const html = renderToStaticMarkup(
      <DashboardPage root title="X">
        <div />
      </DashboardPage>,
    )
    expect(html).toContain('class="space-y-10"')
  })

  it('first crumb always says Home, never Back (matches the new convention)', () => {
    const html = renderToStaticMarkup(
      <DashboardPage title="Whatever" data-test-id="x">
        <div />
      </DashboardPage>,
    )
    expect(html).toContain('>Home</a>')
    expect(html).not.toContain('>Back</a>')
  })
})
