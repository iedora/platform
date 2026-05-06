import { expect, test } from '@playwright/test'
import { testDb } from '../../helpers/db'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../../helpers/auth'

test.describe('Public menu — wrapper lang attribute', () => {
  test('lang on the wrapper reflects the active language', async ({
    page,
    browser,
  }) => {
    const owner = uniqueUser('lang-attr')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Lang Attr Bistro',
      uniqueSlug('lang-attr'),
    )
    const sql = testDb()
    await sql`
      UPDATE restaurant
      SET supported_languages = '["en","pt"]'::jsonb,
          published = true
      WHERE id = ${org.restaurantId}
    `

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anonPage = await anon.newPage()

    await anonPage.goto(`/r/${org.slug}`)
    const root = anonPage.getByTestId('public-menu-root')
    // Default language EN.
    await expect(root).toHaveAttribute('lang', 'en')
    await expect(root).toHaveAttribute('dir', 'ltr')

    await anonPage.goto(`/r/${org.slug}?lang=pt`)
    await expect(root).toHaveAttribute('lang', 'pt')

    await anon.close()
  })
})
