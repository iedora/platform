import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures'
import { seedOrg, bindUserToOrg } from '@/features/identity/testing'
import { seedRestaurant } from '@/features/restaurant-identity/testing'

/**
 * Responsive smoke pass for every dashboard surface. One spec per route:
 *   - load the page at 390×844 (iPhone 14 viewport)
 *   - assert the `<DashboardPage>` shell rendered
 *   - assert the Home breadcrumb is present (non-root pages)
 *   - assert the document doesn't overflow horizontally
 *
 * The shell is the contract: when this passes, every page renders
 * within the mobile viewport with no horizontal scroll. Page-specific
 * interaction lives in the slice's own E2E suite (`qr-codes/e2e`, etc.).
 */

const PHONE = { width: 390, height: 844 } as const

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client)
}

test.describe('@responsive dashboard pages at phone width', () => {
  test('/dashboard renders with no horizontal overflow', async ({ signIn }) => {
    // Root page requires an active org — seed one for this iedora-admin user.
    const org = seedOrg({ id: 'org-root', name: 'Root Co.' })
    const { page, user } = await signIn({
      email: 'responsive-root@iedora.test',
      name: 'Responsive Root',
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    await page.setViewportSize(PHONE)
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-home')).toBeVisible()
    // Root page has no breadcrumb — just an h1.
    await expect(page.getByTestId('dashboard-home-heading')).toBeVisible()
    await assertNoHorizontalOverflow(page)
  })

  test('/dashboard/billing renders with Home breadcrumb', async ({ signIn }) => {
    const org = seedOrg({ id: 'org-billing', name: 'Bill Co.' })
    const { page, user } = await signIn({
      email: 'responsive-billing@iedora.test',
      name: 'Responsive Billing',
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    await page.setViewportSize(PHONE)
    await page.goto('/dashboard/billing')
    await expect(page.getByTestId('billing')).toBeVisible()
    await expect(page.getByTestId('billing-breadcrumb-home')).toBeVisible()
    await expect(page.getByTestId('billing-breadcrumb-home')).toContainText('Home')
    await assertNoHorizontalOverflow(page)
  })

  test('/dashboard/admin/qr-codes renders with Home breadcrumb', async ({ signedInPage }) => {
    await signedInPage.setViewportSize(PHONE)
    await signedInPage.goto('/dashboard/admin/qr-codes')
    await expect(signedInPage.getByTestId('qr-codes-admin')).toBeVisible()
    await expect(signedInPage.getByTestId('qr-codes-admin-breadcrumb-home')).toBeVisible()
    await expect(
      signedInPage.getByTestId('qr-codes-admin-breadcrumb-home'),
    ).toContainText('Home')
    // Heading is the BreadcrumbHere (h1) — sits at the end of the trail.
    await expect(
      signedInPage.getByTestId('qr-codes-admin-breadcrumb-current'),
    ).toContainText('QR codes (admin)')
    await assertNoHorizontalOverflow(signedInPage)
  })

  test('/dashboard/admin/sessions renders with Home breadcrumb', async ({ signedInPage }) => {
    await signedInPage.setViewportSize(PHONE)
    await signedInPage.goto('/dashboard/admin/sessions')
    await expect(signedInPage.getByTestId('sessions-admin')).toBeVisible()
    await expect(signedInPage.getByTestId('sessions-admin-breadcrumb-home')).toBeVisible()
    await assertNoHorizontalOverflow(signedInPage)
  })

  test('/dashboard/r/[slug] renders with Home crumb + restaurant title', async ({
    signIn,
  }) => {
    const org = seedOrg({ id: 'org-rest', name: 'Rest Co.' })
    const r = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Casa de Pedra',
      slug: 'casa-de-pedra',
    })
    const { page, user } = await signIn({
      email: 'responsive-r@iedora.test',
      name: 'Responsive R',
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    await page.setViewportSize(PHONE)
    await page.goto(`/dashboard/r/${r.slug}`)
    await expect(page.getByTestId('restaurant')).toBeVisible()
    await expect(page.getByTestId('restaurant-breadcrumb-home')).toBeVisible()
    await expect(page.getByTestId('restaurant-breadcrumb-current')).toContainText(
      'Casa de Pedra',
    )
    await assertNoHorizontalOverflow(page)
  })

  test('/dashboard/r/[slug]/qr renders with Home + restaurant crumbs', async ({
    signIn,
  }) => {
    const org = seedOrg({ id: 'org-rqr', name: 'RQR Co.' })
    const r = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Pedra do QR',
      slug: 'pedra-qr',
    })
    const { page, user } = await signIn({
      email: 'responsive-rqr@iedora.test',
      name: 'Responsive RQR',
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    await page.setViewportSize(PHONE)
    await page.goto(`/dashboard/r/${r.slug}/qr`)
    await expect(page.getByTestId('restaurant-qr')).toBeVisible()
    await expect(page.getByTestId('restaurant-qr-breadcrumb-home')).toBeVisible()
    await expect(
      page.getByTestId('restaurant-qr-breadcrumb-restaurant'),
    ).toContainText('Pedra do QR')
    await assertNoHorizontalOverflow(page)
  })
})
