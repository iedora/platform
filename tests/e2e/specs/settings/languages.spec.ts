import { expect, test } from '@playwright/test'
import { testDb } from '../../helpers/db'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../../helpers/auth'

test.describe('Settings — languages section', () => {
  test('saves supportedLanguages and defaultLanguage', async ({ page }) => {
    const owner = uniqueUser('langs')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Lang Bistro',
      uniqueSlug('langs'),
    )

    await page.goto(`/dashboard/r/${org.slug}/theme`)

    // Defaults: only English supported. Pick PT as well.
    await page.getByTestId('lang-supported-pt').check()
    await page.getByTestId('languages-save').click()
    await expect(
      page.getByText('Saved', { exact: true }).first(),
    ).toBeVisible()

    // DB column is now ['en','pt']. Order follows registry order, not click order.
    const sql = testDb()
    const rows = await sql<
      { defaultLanguage: string; supportedLanguages: string[] }[]
    >`
      SELECT default_language AS "defaultLanguage",
             supported_languages AS "supportedLanguages"
      FROM restaurant
      WHERE id = ${org.restaurantId}
    `
    expect(rows[0]?.defaultLanguage).toBe('en')
    expect(rows[0]?.supportedLanguages).toEqual(['en', 'pt'])
  })

  test('changing default also locks it in supportedLanguages', async ({ page }) => {
    const owner = uniqueUser('lang-default')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Default Bistro',
      uniqueSlug('lang-default'),
    )

    await page.goto(`/dashboard/r/${org.slug}/theme`)

    // Make Portuguese the default — also marks it supported.
    await page.getByTestId('lang-default-pt').click()
    // English should remain checked but no longer be the default badge.
    await page.getByTestId('languages-save').click()
    await expect(
      page.getByText('Saved', { exact: true }).first(),
    ).toBeVisible()

    const sql = testDb()
    const rows = await sql<
      { defaultLanguage: string; supportedLanguages: string[] }[]
    >`
      SELECT default_language AS "defaultLanguage",
             supported_languages AS "supportedLanguages"
      FROM restaurant
      WHERE id = ${org.restaurantId}
    `
    expect(rows[0]?.defaultLanguage).toBe('pt')
    // en stays in the supported list because we didn't uncheck it.
    expect(rows[0]?.supportedLanguages).toContain('en')
    expect(rows[0]?.supportedLanguages).toContain('pt')
  })
})
