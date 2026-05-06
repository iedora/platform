import { expect, test } from '@playwright/test'
import { testDb } from '../../helpers/db'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../../helpers/auth'

test.describe('Menu builder — category translations', () => {
  test('Translate dialog persists nameI18n + descriptionI18n', async ({
    page,
  }) => {
    const owner = uniqueUser('cat-i18n')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Cat i18n Bistro',
      uniqueSlug('cat-i18n'),
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

    await page.goto(`/dashboard/r/${org.slug}/m/${org.menuId}`)
    await page.getByTestId(`category-translate-${catId}`).click()

    // Default tab keeps the English name; switch to PT and translate.
    await page.getByTestId('category-i18n-tab-pt').click()
    await page.getByTestId('category-name-pt').fill('Pratos principais')
    await page
      .getByTestId('category-description-pt')
      .fill('Os nossos pratos principais')

    await page.getByTestId('category-translate-save').click()
    await expect(page.getByRole('dialog')).toBeHidden()

    const rows = await sql<{
      nameI18n: Record<string, string> | null
      descriptionI18n: Record<string, string> | null
    }[]>`
      SELECT name_i18n AS "nameI18n", description_i18n AS "descriptionI18n"
      FROM category WHERE id = ${catId}
    `
    expect(rows[0]?.nameI18n).toEqual({ pt: 'Pratos principais' })
    expect(rows[0]?.descriptionI18n).toEqual({ pt: 'Os nossos pratos principais' })
  })

  test('hides the Translate button when only one language is supported', async ({
    page,
  }) => {
    const owner = uniqueUser('cat-no-tabs')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Mono Cat Bistro',
      uniqueSlug('mono-cat'),
    )
    const sql = testDb()
    const [{ id: catId }] = await sql<{ id: string }[]>`
      INSERT INTO category (id, menu_id, restaurant_id, name, position, updated_at)
      VALUES (gen_random_uuid()::text, ${org.menuId}, ${org.restaurantId}, 'Solo', 0, now())
      RETURNING id
    `

    await page.goto(`/dashboard/r/${org.slug}/m/${org.menuId}`)
    await expect(
      page.getByTestId(`category-translate-${catId}`),
    ).toHaveCount(0)
  })
})
