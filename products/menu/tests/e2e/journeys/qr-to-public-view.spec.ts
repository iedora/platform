import { test, expect } from '../fixtures'
import { seedOrg } from '@/features/identity/testing'
import { seedRestaurant } from '@/features/restaurant-identity/testing'
import { seedQrCode, qrCodesRoutes } from '@/features/qr-codes/testing'
import { menuPublishingRoutes } from '@/features/menu-publishing/testing'
import { fireBeacon, waitForView } from '@/shared/testing/e2e-beacon'

/**
 * Cross-slice journey: scanning a bound QR code serves the public menu
 * in-place and the view-tracking beacon increments daily_view.
 *
 * Touches qr-codes (sticker → restaurant binding), menu-publishing
 * (public route), metrics (daily_view).
 *
 * Contract: since `1a7d5c5 feat(menu-publishing): shared public-menu-view
 * + inline /q/[code] render` the sticker URL no longer 302s to /r/[slug].
 * It renders the public menu in-place so per-sticker analytics survive
 * bookmarks + shares; SEO is steered to the branded URL via a
 * `<link rel="canonical">`. The journey asserts that new shape.
 */

test.describe('@journey qr to public view', () => {
  test('bound code serves the public menu in-place, beacon increments daily_view', async ({
    page,
    request,
  }) => {
    const org = seedOrg({ id: 'org-qr', name: 'QR Co.' })
    const rest = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'QR Diner',
      slug: 'qr-diner',
    })
    await seedQrCode({ code: 'sticker_qr_1', restaurantId: rest.restaurantId })

    // The sticker URL renders the public menu directly — no redirect.
    // URL stays at /q/<code> so per-sticker analytics in `view_seen` can
    // attribute scans to a specific sticker, not the branded URL.
    const res = await page.goto(qrCodesRoutes.public('sticker_qr_1'))
    expect(res?.status()).toBeLessThan(400)
    expect(page.url()).toContain(qrCodesRoutes.public('sticker_qr_1'))

    // The page IS the bound restaurant's public menu.
    await expect(page.locator('h1, h2, h3').first()).toContainText('QR Diner')

    // Canonical link points at the branded URL so search engines index
    // /r/[slug], not the sticker URL.
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute('href')
    expect(canonical).toContain(menuPublishingRoutes.public(rest.slug))

    // Fire the beacon directly — the public page embeds an <img> tag that
    // calls this, but Playwright lets us assert it deterministically.
    const status = await fireBeacon(request, rest.slug, {
      visitorId: 'visitor-qr-journey',
    })
    expect(status).toBeLessThan(400)
    const { count } = await waitForView(rest.restaurantId)
    expect(count).toBeGreaterThanOrEqual(1)
  })
})
