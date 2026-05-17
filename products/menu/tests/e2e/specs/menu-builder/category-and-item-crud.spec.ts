import { expect, test } from '../../fixtures'
import { seedMenu, seedRestaurant, testDb } from '../../helpers/db'

test.describe('Menu builder — category & item CRUD', () => {
  test('add category, add items, edit item price, delete one item', async ({
    signInNewUser,
    seedOrg,
  }) => {
    const { context, page, user } = await signInNewUser('items-crud')
    const org = await seedOrg({
      name: 'Items Bistro',
      slug: `items-${Date.now().toString(36)}`,
      ownerId: user.userId,
    })
    const { restaurantId } = await seedRestaurant(
      org.id,
      'Items Bistro',
      org.slug,
    )
    const { menuId } = await seedMenu(restaurantId, 'Main menu')

    await page.goto(`/dashboard/r/${org.slug}/m/${menuId}`)
    await expect(page.getByText('Main menu')).toBeVisible()
    await expect(page.getByText('No categories yet.')).toBeVisible()

    // Add a category.
    await page
      .getByPlaceholder('New category name (e.g. Starters)')
      .fill('Starters')
    await page.getByRole('button', { name: 'Add category' }).click()
    await expect(page.getByText('Starters')).toBeVisible()

    // Add three items.
    const itemNameInput = page.getByPlaceholder('Item name')
    const itemPriceInput = page.getByPlaceholder('0.00')
    for (const [name, price] of [
      ['Olives', '3.50'],
      ['Bruschetta', '6.50'],
      ['Soup', '5.00'],
    ] as const) {
      await itemNameInput.fill(name)
      await itemPriceInput.fill(price)
      await page.getByRole('button', { name: 'Add item' }).click()
      await expect(page.getByText(name)).toBeVisible()
    }

    // Edit Bruschetta's price.
    await page.getByRole('button', { name: /Bruschetta/ }).click()
    const editor = page.getByRole('dialog')
    await expect(editor.getByText(/Edit item/i)).toBeVisible()
    await editor.getByLabel(/^Price/i).fill('7.00')
    await editor.getByRole('button', { name: /Save|Saving/i }).click()
    await expect(editor).toBeHidden()
    await expect(page.getByText('€7.00')).toBeVisible()

    // Delete Olives.
    await page.getByRole('button', { name: /Olives/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: /Delete/i }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText('Olives')).toHaveCount(0)

    // DB check: 2 items left under the category.
    const sql = testDb()
    const rows = await sql<{ name: string; price_cents: number }[]>`
      SELECT name, price_cents FROM "menu"."item"
      WHERE restaurant_id = ${restaurantId}
      ORDER BY position
    `
    expect(rows.map((r) => r.name).sort()).toEqual(['Bruschetta', 'Soup'])
    const bruschetta = rows.find((r) => r.name === 'Bruschetta')
    expect(bruschetta?.price_cents).toBe(700)

    await context.close()
  })
})
