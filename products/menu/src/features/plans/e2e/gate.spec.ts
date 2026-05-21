import { test, expect } from '../../../../tests/e2e/fixtures'
import { setPlan, getPlan, planRoutes } from '../testing'
import { seedOrg, bindUserToOrg } from '@/features/identity/testing'
import { seedRestaurant } from '@/features/restaurant-identity/testing'

/**
 * Plans slice — exercises the gate flips. We don't drive the upgrade UI
 * here (that lives in the plan-upgrade journey); we assert the plan-row
 * round-trip and that the billing page reflects the current plan.
 */

test.describe('@smoke plans gate', () => {
  test('default plan is free; setPlan(casa) flips it', async ({ signIn }) => {
    const org = seedOrg({ id: 'org-plan', name: 'Plan Org' })
    const { page, user } = await signIn({
      email: 'plan@iedora.test',
      name: 'Plan User',
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)
    await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Plan Bistro',
      slug: 'plan-bistro',
    })

    // org_plan is absent → coercion to default plan (free).
    expect(await getPlan(org.organizationId)).toBeNull()

    await setPlan(org.organizationId, 'casa')
    expect(await getPlan(org.organizationId)).toBe('casa')

    const res = await page.goto(planRoutes.billing)
    expect(res?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toContainText(/casa/i)
  })
})
