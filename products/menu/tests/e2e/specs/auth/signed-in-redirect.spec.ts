import { expect, test } from '../../fixtures'
import { seedRestaurant } from '../../helpers/db'

test.describe('Signed-in redirects', () => {
  test('user with no org → /dashboard redirects to /onboarding', async ({
    signedInPage,
  }) => {
    await signedInPage.goto('/dashboard')
    await expect(signedInPage).toHaveURL(/\/onboarding(\?|$)/)
    await expect(signedInPage.getByText('name the room')).toBeVisible()
  })

  test('user with org+restaurant → "/" auto-redirects to /dashboard', async ({
    signInNewUser,
    seedOrg,
  }) => {
    const { context, page, user } = await signInNewUser('redir')
    const org = await seedOrg({
      name: 'Redir Bistro',
      slug: `redir-${Date.now()}`,
      ownerId: user.userId,
    })
    await seedRestaurant(org.id, 'Redir Bistro', org.slug)

    await page.goto('/')

    // src/app/page.tsx: signed-in user with an org redirects to /dashboard.
    await expect(page).toHaveURL(/\/dashboard(\?|$)/)

    await context.close()
  })
})
