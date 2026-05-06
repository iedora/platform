import { expect, test } from '@playwright/test'
import { testDb } from '../../helpers/db'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../../helpers/auth'

test.describe('Menu builder — item translations', () => {
  test('per-language tabs in the item dialog persist nameI18n + descriptionI18n', async ({
    page,
  }) => {
    const owner = uniqueUser('item-i18n')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Translate Bistro',
      uniqueSlug('translate'),
    )

    const sql = testDb()
    await sql`
      UPDATE restaurant
      SET supported_languages = '["en","pt"]'::jsonb
      WHERE id = ${org.restaurantId}
    `
    const [{ id: catId }] = await sql<{ id: string }[]>`
      INSERT INTO category (id, menu_id, restaurant_id, name, position, updated_at)
      VALUES (gen_random_uuid()::text, ${org.menuId}, ${org.restaurantId}, 'Mains', 0, now())
      RETURNING id
    `
    const [{ id: itemId }] = await sql<{ id: string }[]>`
      INSERT INTO item (id, category_id, restaurant_id, name, description, price_cents, currency, available, position, updated_at)
      VALUES (gen_random_uuid()::text, ${catId}, ${org.restaurantId}, 'Risotto', 'With mushrooms', 1450, 'EUR', true, 0, now())
      RETURNING id
    `

    await page.goto(`/dashboard/r/${org.slug}/m/${org.menuId}`)
    await page.getByRole('button', { name: /Risotto/ }).click()

    // Tabs are visible because the restaurant supports two languages.
    await expect(page.getByTestId('item-i18n-tabs')).toBeVisible()

    // Switch to PT tab and fill in the translation.
    await page.getByTestId('item-i18n-tab-pt').click()
    await page.getByTestId('item-name-pt').fill('Risoto')
    await page.getByTestId('item-description-pt').fill('Com cogumelos')

    // Default tab still has the English values when we switch back.
    await page.getByTestId('item-i18n-tab-en').click()
    await expect(page.getByTestId('item-name-en')).toHaveValue('Risotto')

    // Save dialog → wait for the action to commit before reading the DB.
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    const rows = await sql<{
      nameI18n: Record<string, string> | null
      descriptionI18n: Record<string, string> | null
    }[]>`
      SELECT name_i18n AS "nameI18n", description_i18n AS "descriptionI18n"
      FROM item WHERE id = ${itemId}
    `
    expect(rows[0]?.nameI18n).toEqual({ pt: 'Risoto' })
    expect(rows[0]?.descriptionI18n).toEqual({ pt: 'Com cogumelos' })
  })

  test('hides tabs when restaurant only supports one language', async ({
    page,
  }) => {
    const owner = uniqueUser('item-no-tabs')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Mono Bistro',
      uniqueSlug('mono'),
    )

    const sql = testDb()
    const [{ id: catId }] = await sql<{ id: string }[]>`
      INSERT INTO category (id, menu_id, restaurant_id, name, position, updated_at)
      VALUES (gen_random_uuid()::text, ${org.menuId}, ${org.restaurantId}, 'Mains', 0, now())
      RETURNING id
    `
    await sql`
      INSERT INTO item (id, category_id, restaurant_id, name, price_cents, currency, available, position, updated_at)
      VALUES (gen_random_uuid()::text, ${catId}, ${org.restaurantId}, 'Solo Item', 100, 'EUR', true, 0, now())
    `

    await page.goto(`/dashboard/r/${org.slug}/m/${org.menuId}`)
    await page.getByRole('button', { name: /Solo Item/ }).click()
    await expect(page.getByTestId('item-i18n-tabs')).toHaveCount(0)
  })
})
