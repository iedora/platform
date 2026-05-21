import { test, expect } from '../fixtures'
import { memberProfile } from '@/features/auth/testing'
import { seedOrg, bindUserToOrg } from '@/features/identity/testing'
import { seedRestaurant } from '@/features/restaurant-identity/testing'
import {
  seedMenu,
  seedCategory,
  seedItem,
} from '@/features/menu-builder/testing'
import { menuPublishingRoutes } from '@/features/menu-publishing/testing'

/**
 * Cross-slice journey: a seeded menu must render on the public route at
 * `/r/{slug}`. Touches restaurant-identity (slug), menu-builder
 * (categories + items), menu-publishing (cache + render).
 *
 * Cache-invalidation specifics (mutate via dashboard → public reflects)
 * belong in the menu-publishing slice's own e2e/ — that surface is the
 * dominant slice for that assertion.
 */

test.describe('@journey menu build & publish', () => {
  test('seeded items render on the public menu', async ({ signIn, page }) => {
    const org = seedOrg({ id: 'org-build', name: 'Build Co.' })
    const { user } = await signIn({
      email: 'build@iedora.test',
      name: 'Builder',
      profile: memberProfile,
      organizationId: org.organizationId,
    })
    await bindUserToOrg(user.userId, org)

    const rest = await seedRestaurant({
      organizationId: org.organizationId,
      name: 'Build Bistro',
      slug: 'build-bistro',
    })
    const menu = await seedMenu(rest.restaurantId, { name: 'Lunch' })
    const cat = await seedCategory(menu.menuId, rest.restaurantId, {
      name: 'Starters',
    })
    await seedItem(cat.categoryId, rest.restaurantId, {
      name: 'Croquettes',
      priceCents: 600,
    })
    await seedItem(cat.categoryId, rest.restaurantId, {
      name: 'Olives',
      priceCents: 300,
      position: 1,
    })

    const res = await page.goto(menuPublishingRoutes.public(rest.slug))
    expect(res?.status()).toBeLessThan(400)
    await expect(page.locator('body')).toContainText('Starters')
    await expect(page.locator('body')).toContainText('Croquettes')
    await expect(page.locator('body')).toContainText('Olives')
  })
})
