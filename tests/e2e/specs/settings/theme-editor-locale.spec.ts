import { expect, test } from '@playwright/test'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../../helpers/auth'

// Failing-first: this spec asserts that the settings page (theme editor)
// translates to PT when the user picks Portuguese in the dashboard locale
// switcher. It should fail until theme-editor.tsx is wired to useTranslations.
test.describe('Settings — theme editor (UI locale)', () => {
  test('section headings translate to PT', async ({ page }) => {
    const owner = uniqueUser('theme-locale')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Theme Locale Bistro',
      uniqueSlug('theme-locale'),
    )

    // Switch dashboard UI to PT first, then navigate.
    await page.goto('/dashboard')
    await page.getByTestId('user-locale-switcher').selectOption('pt')
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt')

    await page.goto(`/dashboard/r/${org.slug}/theme`)

    // Page heading uses Settings.title; subtitle covered indirectly.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Definições' }),
    ).toBeVisible()

    // Each form section is its own h2. PT catalog has all three.
    await expect(
      page.getByRole('heading', { level: 2, name: 'Identidade' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Idiomas' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Tema' }),
    ).toBeVisible()
  })
})
