import { test, expect } from '../fixtures'
import { seedOrg } from '@/features/identity/testing'
import { seedRestaurant } from '@/features/restaurant-identity/testing'
import { seedQrCode, qrCodesRoutes } from '@/features/qr-codes/testing'
import { menuPublishingRoutes } from '@/features/menu-publishing/testing'
import { fireBeacon, waitForView } from '@/shared/testing/e2e-beacon'

/**
 * Cross-slice journey: scanning a bound QR code lands the visitor on the
 * public menu and the view-tracking beacon increments daily_view.
 *
 * Touches qr-codes (sticker → restaurant binding), menu-publishing
 * (public route), metrics (daily_view).
 */

test.describe('@journey qr to public view', () => {
  test('bound code redirects, beacon increments daily_view', async ({
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

    // The /q/<code> endpoint is a 302 to the public menu — follow=false
    // would be a tighter assertion, but Playwright auto-follows by
    // default and the destination URL is observable from `page.url()`.
    const res = await page.goto(qrCodesRoutes.public('sticker_qr_1'))
    expect(res?.status()).toBeLessThan(400)
    expect(page.url()).toContain(menuPublishingRoutes.public(rest.slug))

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
