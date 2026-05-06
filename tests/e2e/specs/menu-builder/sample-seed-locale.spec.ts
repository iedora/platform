import { expect, test } from '@playwright/test'
import { testDb } from '../../helpers/db'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../../helpers/auth'

// Failing-first: when defaultLanguage='pt', the Sample menu button should
// seed Portuguese category/item text into the plain `name` column (since
// `name` is the source of truth for the default language). With EN also
// in supportedLanguages, the English strings should land in `nameI18n.en`.
//
// Failing now means: SAMPLE_MENU is hardcoded English.
test.describe('Menu builder — sample seed honors defaultLanguage', () => {
  test('PT-default restaurant seeds PT in name + EN in nameI18n', async ({
    page,
  }) => {
    const owner = uniqueUser('seed-pt')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'PT Seed Bistro',
      uniqueSlug('seed-pt'),
    )

    // Switch the restaurant to PT default + EN supported BEFORE seeding.
    const sql = testDb()
    await sql`
      UPDATE restaurant
      SET default_language = 'pt',
          supported_languages = '["pt","en"]'::jsonb
      WHERE id = ${org.restaurantId}
    `

    await page.goto(`/dashboard/r/${org.slug}`)
    await page.getByTestId('seed-sample-menu').click()
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/r/${org.slug}/m/[a-f0-9-]+$`),
    )

    // Categories: name in PT, nameI18n.en populated for the cross-tenant safety.
    const cats = await sql<{
      name: string
      nameI18n: Record<string, string> | null
    }[]>`
      SELECT name, name_i18n AS "nameI18n"
      FROM category
      WHERE restaurant_id = ${org.restaurantId}
      ORDER BY position
    `
    expect(cats.map((c) => c.name)).toEqual(['Entradas', 'Pratos principais', 'Sobremesas'])
    // EN translations land in the i18n map for visitors who pick ?lang=en.
    expect(cats[0]?.nameI18n).toEqual({ en: 'Starters' })

    // Items: a PT-default item ("Bruschetta" → "Bruschetta", "Risotto Funghi" → "Risoto de cogumelos").
    const items = await sql<{
      name: string
      nameI18n: Record<string, string> | null
    }[]>`
      SELECT name, name_i18n AS "nameI18n"
      FROM item
      WHERE restaurant_id = ${org.restaurantId}
      ORDER BY name
    `
    const risoto = items.find((i) => i.name === 'Risoto de cogumelos')
    expect(risoto, 'Risoto de cogumelos must exist in PT name column').toBeTruthy()
    expect(risoto?.nameI18n).toEqual({ en: 'Risotto Funghi' })

    // Menu container name follows the same rule. Filter out the default
    // "Main menu" that apiCreateAndActivateOrg seeds during signup.
    const menus = await sql<{
      name: string
      nameI18n: Record<string, string> | null
    }[]>`
      SELECT name, name_i18n AS "nameI18n"
      FROM menu
      WHERE restaurant_id = ${org.restaurantId}
        AND name <> 'Main menu'
    `
    expect(menus[0]?.name).toBe('Menu de exemplo')
    expect(menus[0]?.nameI18n).toEqual({ en: 'Sample menu' })
  })
})
