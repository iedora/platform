import { expect, test } from '../../fixtures'
import {
  seedCategoryWithItems,
  seedMenu,
  seedRestaurant,
  testDb,
} from '../../helpers/db'

test.describe('Menu builder — drag & drop reorder', () => {
  test.fixme(
    true,
    'TODO(test): dnd-kit reordering via the KeyboardSensor / PointerSensor ' +
      'does not reliably trip from synthetic Playwright events. See ' +
      'menu-builder/ui/sortable-* — the spec is shaped for the moment ' +
      'a documented Playwright recipe (or a non-UI hook) lands. The ' +
      'expectation below would be: after moving item 1 to position 3, ' +
      'reload and the DB row positions should reflect [item2,item3,item1].',
  )

  test('reorder item 1 → position 3, persists in DB', async ({
    signInNewUser,
    seedOrg,
  }) => {
    const { context, page, user } = await signInNewUser('reorder')
    const org = await seedOrg({
      name: 'Reorder Bistro',
      slug: `reorder-${Date.now().toString(36)}`,
      ownerId: user.userId,
    })
    const { restaurantId } = await seedRestaurant(
      org.id,
      'Reorder Bistro',
      org.slug,
    )
    const { menuId } = await seedMenu(restaurantId, 'Main menu')
    await seedCategoryWithItems(menuId, restaurantId, 'Starters', [
      'Alpha',
      'Bravo',
      'Charlie',
    ])

    await page.goto(`/dashboard/r/${org.slug}/m/${menuId}`)
    await expect(page.getByText('Alpha')).toBeVisible()

    // Drag Alpha down past Charlie via the keyboard sensor. dnd-kit's
    // KeyboardSensor expects: focus drag handle → Space → ArrowDown ×N
    // → Space. The handle's accessible name is "Drag item" in the
    // sortable-item component.
    const handles = page.getByRole('button', { name: /Drag item/i })
    await handles.first().focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Space')

    await page.reload()

    const sql = testDb()
    const rows = await sql<{ name: string; position: number }[]>`
      SELECT name, position FROM "menu"."item"
      WHERE restaurant_id = ${restaurantId}
      ORDER BY position
    `
    expect(rows.map((r) => r.name)).toEqual(['Bravo', 'Charlie', 'Alpha'])

    await context.close()
  })
})
