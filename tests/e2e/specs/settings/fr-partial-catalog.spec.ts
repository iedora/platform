import { expect, test } from '@playwright/test'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../../helpers/auth'

// Critical contract test: French is in the language registry but the catalog
// (i18n/messages/fr.json) is partial. This spec verifies two things:
//
//   1. Picking FR in the dashboard switcher updates `<html lang>` even when
//      the catalog is missing or partial — the request config falls back to
//      English messages without crashing.
//   2. A key that *does* exist in fr.json renders in French; a key that
//      doesn't fall back to the English string. The fallback is per-key,
//      not per-locale.
//
// This proves that adding a language to lib/i18n is safe: no UI catalog
// required up front; partial catalogs ship value as soon as they're committed.
test.describe('Dashboard UI locale (next-intl) — FR partial catalog', () => {
  test('html lang updates and translated keys render in FR while others fall back to EN', async ({
    page,
  }) => {
    const owner = uniqueUser('fr-partial')
    await apiSignup(page.request, owner)
    await apiCreateAndActivateOrg(
      page.request,
      'FR Bistro',
      uniqueSlug('fr-partial'),
    )

    await page.goto('/dashboard')
    await page.getByTestId('user-locale-switcher').selectOption('fr')

    // (1) html lang reflects the picked locale even if the catalog is partial.
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')

    // (2a) AppHeader.logout has a French translation in fr.json — should
    // render the French label.
    await expect(
      page.getByRole('button', { name: 'Se déconnecter' }),
    ).toBeVisible()

    // (2b) Dashboard.title has no French translation in fr.json — must fall
    // back to the English value rather than show a missing-key error or
    // crash the page. The English title is the brand phrase "A carta da casa."
    await expect(
      page.getByRole('heading', { level: 1, name: 'A carta da casa.' }),
    ).toBeVisible()
  })
})
