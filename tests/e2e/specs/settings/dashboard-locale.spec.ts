import { expect, test } from '@playwright/test'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../../helpers/auth'

test.describe('Dashboard UI locale (next-intl)', () => {
  test('switching the locale switcher swaps strings + html lang', async ({
    page,
  }) => {
    const owner = uniqueUser('locale')
    await apiSignup(page.request, owner)
    await apiCreateAndActivateOrg(
      page.request,
      'Locale Bistro',
      uniqueSlug('locale'),
    )

    await page.goto('/dashboard')

    // Default locale is English — the dashboard heading uses next-intl `t`.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Restaurants' }),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    // Switch UI to Portuguese via the header switcher.
    await page.getByTestId('user-locale-switcher').selectOption('pt')

    // Heading reflects PT catalog.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Restaurantes' }),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt')
  })
})
