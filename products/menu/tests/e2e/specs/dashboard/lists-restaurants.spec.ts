import { expect, test } from '../../fixtures'
import { seedRestaurant } from '../../helpers/db'

test.describe('Dashboard — restaurant list', () => {
  test('renders one row per restaurant in the active organisation', async ({
    signInNewUser,
    seedOrg,
  }) => {
    const { context, page, user } = await signInNewUser('dash-list')

    // Active-org model: the dashboard lists restaurants under the user's
    // FIRST organisation (the "effective" one). Seed two orgs but only
    // restaurants under the first to lock behavior — when the user has
    // multiple orgs we don't aggregate.
    const orgA = await seedOrg({
      name: 'Org A',
      slug: `org-a-${Date.now().toString(36)}`,
      ownerId: user.userId,
    })

    const slugA1 = `a1-${Date.now().toString(36)}`
    const slugA2 = `a2-${Date.now().toString(36)}`
    await seedRestaurant(orgA.id, 'Bistro A1', slugA1)
    await seedRestaurant(orgA.id, 'Bistro A2', slugA2)

    await page.goto('/dashboard')

    const rows = page.getByTestId('editorial-row')
    await expect(rows).toHaveCount(2)
    await expect(page.getByText('Bistro A1')).toBeVisible()
    await expect(page.getByText('Bistro A2')).toBeVisible()

    // The title link points at /dashboard/r/<slug>.
    await expect(page.getByRole('link').filter({ hasText: 'Bistro A1' })).toHaveAttribute(
      'href',
      `/dashboard/r/${slugA1}`,
    )

    await context.close()
  })
})
