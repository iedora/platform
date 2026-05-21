import { test, expect } from '../fixtures'
import { memberProfile } from '@/features/auth/testing'
import { seedOrg, bindUserToOrg } from '@/features/identity/testing'
import { seedRestaurant } from '@/features/restaurant-identity/testing'
import { setPlan, getPlan, planRoutes } from '@/features/plans/testing'
import { metricsRoutes } from '@/features/metrics/testing'

/**
 * Cross-slice journey: a free-plan org is blocked from the analytics
 * surface; flipping the plan to `casa` opens it. The "upgrade" itself
 * is fake (DB-only setPlan) per CLAUDE.md note — no Stripe yet.
 *
 * Touches plans (gate state), billing (page chrome), metrics
 * (analytics route).
 */

test.describe('@journey plan upgrade', () => {
  test('free → casa lifts the analytics gate', async ({ signIn }) => {
    const org = seedOrg({ id: 'org-upgrade', name: 'Upgrade Co.' })
    const { page, user } = await signIn({
      email: 'upgrade@iedora.test',
      name: 'Upgrader',
      profile: memberProfile,
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)
    await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Upgrade Café',
      slug: 'upgrade-cafe',
    })

    // Free plan (default) blocks analytics — production redirects to /dashboard/billing.
    await page.goto(metricsRoutes.analytics)
    expect(page.url()).toContain(planRoutes.billing)

    await setPlan(org.organizationId, 'casa')
    expect(await getPlan(org.organizationId)).toBe('casa')

    const res = await page.goto(metricsRoutes.analytics)
    expect(res?.status()).toBeLessThan(400)
    expect(page.url()).toContain(metricsRoutes.analytics)
  })
})
