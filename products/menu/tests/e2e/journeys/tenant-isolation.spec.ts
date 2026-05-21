import { test, expect } from '../fixtures'
import { memberProfile } from '@/features/auth/testing'
import { seedOrg, bindUserToOrg } from '@/features/identity/testing'
import {
  seedRestaurant,
  restaurantIdentityRoutes,
} from '@/features/restaurant-identity/testing'
import {
  seedMenu,
  seedCategory,
  seedItem,
  menuBuilderRoutes,
} from '@/features/menu-builder/testing'

/**
 * Tenant-isolation journey — the critical guard for menu CLAUDE.md
 * rule #1. Two orgs, two users, one tries to read the other's
 * restaurant by URL. The DAL MUST refuse: status >= 400 OR a redirect
 * AWAY from the protected resource. We accept either, because both
 * production responses (404, 403 redirect) satisfy the safety property.
 *
 * Adding new tenant-scoped surfaces? Add a probe to the loop below —
 * one assertion per surface is enough; this journey is the canary, not
 * exhaustive coverage.
 */

test.describe('@critical tenant isolation', () => {
  test("user B cannot reach user A's restaurant", async ({ signIn }) => {
    const orgA = seedOrg({ id: 'org-a', name: 'Org A' })
    const orgB = seedOrg({ id: 'org-b', name: 'Org B' })

    const a = await signIn({
      email: 'a@iedora.test',
      name: 'Alice',
      profile: memberProfile,
      organizationId: orgA.organizationId,
    })
    const b = await signIn({
      email: 'b@iedora.test',
      name: 'Bob',
      profile: memberProfile,
      organizationId: orgB.organizationId,
    })
    await bindUserToOrg(a.user.userId, orgA)
    await bindUserToOrg(b.user.userId, orgB)

    const restA = await seedRestaurant({
      organizationId: orgA.organizationId,
      name: "Alice's Diner",
      slug: 'alice-diner',
    })
    const menuA = await seedMenu(restA.restaurantId, { name: 'Main' })
    const catA = await seedCategory(menuA.menuId, restA.restaurantId, {
      name: 'Mains',
    })
    await seedItem(catA.categoryId, restA.restaurantId, {
      name: 'Burger',
      priceCents: 1500,
    })

    // Sanity: Alice can see her own dashboard for the restaurant.
    const aResHome = await a.page.goto(restaurantIdentityRoutes.home(restA.slug))
    expect(aResHome?.status()).toBeLessThan(400)

    // Bob hits the same URLs. None of these should succeed.
    const probes: { name: string; url: string }[] = [
      { name: 'restaurant home', url: restaurantIdentityRoutes.home(restA.slug) },
      { name: 'theme editor', url: restaurantIdentityRoutes.theme(restA.slug) },
      {
        name: 'menu builder',
        url: menuBuilderRoutes.builder(restA.slug, menuA.menuId),
      },
    ]

    for (const probe of probes) {
      const res = await b.page.goto(probe.url)
      const blocked =
        (res?.status() ?? 500) >= 400 ||
        !b.page.url().includes(probe.url.split('?')[0]!)
      expect(blocked, `Bob should not reach ${probe.name} (${probe.url})`).toBe(true)
    }
  })
})
