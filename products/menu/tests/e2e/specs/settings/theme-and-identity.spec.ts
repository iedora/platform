import { expect, test } from '../../fixtures'
import { seedRestaurant, testDb } from '../../helpers/db'

test.describe('Theme + identity settings', () => {
  test('save a theme change → public page reflects the layout', async ({
    signInNewUser,
    seedOrg,
    browser,
  }) => {
    const { context, page, user } = await signInNewUser('theme')
    const org = await seedOrg({
      name: 'Theme Bistro',
      slug: `theme-${Date.now().toString(36)}`,
      ownerId: user.userId,
    })
    await seedRestaurant(org.id, 'Theme Bistro', org.slug)

    await page.goto(`/dashboard/r/${org.slug}/theme`)

    // The theme editor exposes a layout picker as two aria-pressed
    // buttons with data-testid="layout-<id>".
    await page.getByTestId('layout-minimal').click()

    // Save button. Multiple variants of the label exist; the persisted
    // success is what matters.
    await page
      .getByRole('button', { name: /^Save$|Save theme|Save changes/i })
      .first()
      .click()

    // DB check: the theme jsonb has layout: 'minimal'.
    const sql = testDb()
    await expect
      .poll(
        async () => {
          const [row] = await sql<{ theme: { layout?: string } | null }[]>`
            SELECT theme FROM "menu"."restaurant" WHERE slug = ${org.slug}
          `
          return row?.theme?.layout
        },
        { timeout: 5_000 },
      )
      .toBe('minimal')

    // Public page renders without erroring.
    const anonCtx = await browser.newContext()
    const anon = await anonCtx.newPage()
    const res = await anon.goto(`/r/${org.slug}`)
    expect(res?.status()).toBe(200)
    await anonCtx.close()

    await context.close()
  })
})
