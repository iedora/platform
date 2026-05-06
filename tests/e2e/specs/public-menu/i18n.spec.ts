import { expect, test } from '@playwright/test'
import { testDb } from '../../helpers/db'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../../helpers/auth'

test.describe('Public menu — i18n rendering', () => {
  test('switches language via ?lang and falls back to default for missing translations', async ({
    page,
    browser,
  }) => {
    const owner = uniqueUser('i18n')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'i18n Bistro',
      uniqueSlug('i18n'),
    )

    const sql = testDb()
    // Multi-language restaurant: default EN, supports PT too. Published.
    await sql`
      UPDATE restaurant
      SET default_language = 'en',
          supported_languages = '["en","pt"]'::jsonb,
          published = true
      WHERE id = ${org.restaurantId}
    `

    // Seed two items: one fully translated, one only in default.
    const [{ id: catId }] = await sql<{ id: string }[]>`
      INSERT INTO category (id, menu_id, restaurant_id, name, position, updated_at)
      VALUES (gen_random_uuid()::text, ${org.menuId}, ${org.restaurantId}, 'Mains', 0, now())
      RETURNING id
    `
    await sql`
      INSERT INTO item (id, category_id, restaurant_id, name, name_i18n, description, description_i18n, price_cents, currency, available, position, updated_at)
      VALUES
        (
          gen_random_uuid()::text, ${catId}, ${org.restaurantId},
          'Risotto', '{"pt":"Risoto"}'::jsonb,
          'Mushroom and parmesan', '{"pt":"Cogumelos e parmesão"}'::jsonb,
          1450, 'EUR', true, 0, now()
        ),
        (
          gen_random_uuid()::text, ${catId}, ${org.restaurantId},
          'Bruschetta', NULL,
          'Tomato and basil', NULL,
          800, 'EUR', true, 1, now()
        )
    `

    // Anonymous context — no admin cookies leak.
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anonPage = await anon.newPage()

    // Default render (no ?lang) — English.
    await anonPage.goto(`/r/${org.slug}`)
    await expect(anonPage.getByText('Risotto')).toBeVisible()
    await expect(anonPage.getByText('Bruschetta')).toBeVisible()
    await expect(
      anonPage.getByText('Mushroom and parmesan'),
    ).toBeVisible()

    // Switcher visible because supportedLanguages.length > 1.
    const switcher = anonPage.getByTestId('language-switcher')
    await expect(switcher).toBeVisible()

    // Click PT link — page reloads with ?lang=pt.
    await anonPage.getByTestId('lang-link-pt').click()
    await expect(anonPage).toHaveURL(/\?lang=pt$/)

    // Translated item flips to PT.
    await expect(anonPage.getByText('Risoto')).toBeVisible()
    await expect(
      anonPage.getByText('Cogumelos e parmesão'),
    ).toBeVisible()

    // Item without a PT translation falls back to the default (EN) text.
    await expect(anonPage.getByText('Bruschetta')).toBeVisible()
    await expect(anonPage.getByText('Tomato and basil')).toBeVisible()

    // Unsupported lang in querystring is ignored — falls back to default.
    await anonPage.goto(`/r/${org.slug}?lang=de`)
    await expect(anonPage.getByText('Risotto')).toBeVisible()

    await anon.close()
  })

  test('hides switcher when only one language is supported', async ({
    page,
    browser,
  }) => {
    const owner = uniqueUser('one-lang')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Solo Bistro',
      uniqueSlug('solo'),
    )
    const sql = testDb()
    await sql`UPDATE restaurant SET published = true WHERE id = ${org.restaurantId}`

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anonPage = await anon.newPage()
    await anonPage.goto(`/r/${org.slug}`)
    await expect(anonPage.getByTestId('language-switcher')).toHaveCount(0)
    await anon.close()
  })
})
