import { expect, test } from '../../fixtures'
import {
  seedCategoryWithItems,
  seedMenu,
  seedRestaurant,
} from '../../helpers/db'

// Public page is anonymous. Force a clean storage state so a stray
// signed-in cookie doesn't change what the page renders.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Public menu page (/r/[slug])', () => {
  test('renders restaurant name, sections, items, and prices', async ({
    page,
    signInNewUser,
    seedOrg,
  }) => {
    const { context, user } = await signInNewUser('public-render')
    const org = await seedOrg({
      name: 'Public Bistro',
      slug: `public-${Date.now().toString(36)}`,
      ownerId: user.userId,
    })
    const { restaurantId } = await seedRestaurant(
      org.id,
      'Public Bistro',
      org.slug,
    )
    const { menuId } = await seedMenu(restaurantId, 'Main menu')
    await seedCategoryWithItems(menuId, restaurantId, 'Mains', [
      'Steak frites',
      'Risotto',
    ])

    // Anonymous browse (the test's own page has a fresh, empty storage state).
    const res = await page.goto(`/r/${org.slug}`)
    expect(res?.status()).toBe(200)

    await expect(
      page.getByRole('heading', { name: 'Public Bistro' }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mains' })).toBeVisible()
    await expect(page.getByText('Steak frites')).toBeVisible()
    await expect(page.getByText('Risotto')).toBeVisible()
    // seedCategoryWithItems uses prices in cents: item 1 = 100, item 2 = 200.
    await expect(page.getByText('€1.00')).toBeVisible()
    await expect(page.getByText('€2.00')).toBeVisible()

    await context.close()
  })

  test('unknown slug returns 404', async ({ page }) => {
    const res = await page.goto('/r/no-such-slug-xyz', {
      waitUntil: 'commit',
    })
    expect(res?.status()).toBe(404)
  })
})
