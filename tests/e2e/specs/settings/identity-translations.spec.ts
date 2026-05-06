import { expect, test } from '@playwright/test'
import { testDb } from '../../helpers/db'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../../helpers/auth'

test.describe('Settings — identity description translations', () => {
  test('translates restaurant description into PT and surfaces it on /r/[slug]', async ({
    page,
    browser,
  }) => {
    const owner = uniqueUser('id-i18n')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Identity i18n Bistro',
      uniqueSlug('id-i18n'),
    )

    const sql = testDb()
    await sql`
      UPDATE restaurant
      SET supported_languages = '["en","pt"]'::jsonb,
          description = 'Cosy spot in town',
          published = true
      WHERE id = ${org.restaurantId}
    `

    await page.goto(`/dashboard/r/${org.slug}/theme`)

    // Identity description gets the LocalizedFields tabs because the
    // restaurant supports more than one language.
    await page.getByTestId('identity-i18n-tab-pt').click()
    await page
      .getByTestId('identity-description-pt')
      .fill('Restaurante acolhedor no centro')
    await page.getByTestId('identity-save').click()
    await expect(
      page.getByText('Saved', { exact: true }).first(),
    ).toBeVisible()

    // Public page in PT shows the translated description.
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anonPage = await anon.newPage()
    await anonPage.goto(`/r/${org.slug}?lang=pt`)
    await expect(
      anonPage.getByText('Restaurante acolhedor no centro'),
    ).toBeVisible()

    // EN fallback still uses the default text column.
    await anonPage.goto(`/r/${org.slug}?lang=en`)
    await expect(anonPage.getByText('Cosy spot in town')).toBeVisible()
    await anon.close()
  })
})
