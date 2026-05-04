import { expect, test } from '@playwright/test'
import { testDb } from '../helpers/db'
import {
  apiCreateAndActivateOrg,
  apiSignup,
  uniqueSlug,
  uniqueUser,
} from '../helpers/auth'

// Public page is unauthenticated. Each test forces a clean storageState so a
// stray cookie from a previous case can't change behavior.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Public menu page (/r/[slug])', () => {
  test('returns 404 when the restaurant is a draft', async ({ page }) => {
    // Seed a draft restaurant directly.
    const slug = uniqueSlug('draft')
    const sql = testDb()
    await sql`
      INSERT INTO organization (id, name, slug, created_at)
      VALUES (${`org-${slug}`}, 'Draft Co', ${slug}, now())
    `
    await sql`
      INSERT INTO restaurant (id, organization_id, name, slug, published)
      VALUES (${`rest-${slug}`}, ${`org-${slug}`}, 'Draft Bistro', ${slug}, false)
    `

    const res = await page.goto(`/r/${slug}`, { waitUntil: 'commit' })
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Menu not found' })).toBeVisible()
  })

  test('returns 404 when the slug does not exist', async ({ page }) => {
    const res = await page.goto('/r/nonexistent-slug-xyz-123', {
      waitUntil: 'commit',
    })
    expect(res?.status()).toBe(404)
  })

  test('renders categories and items for a published restaurant', async ({
    page,
    request,
  }) => {
    // Use the same seeding helper but flip published + add menu data via DB
    const owner = uniqueUser('public-render')
    await apiSignup(request, owner)
    const org = await apiCreateAndActivateOrg(
      request,
      'Published Bistro',
      uniqueSlug('published'),
    )

    const sql = testDb()
    await sql`UPDATE restaurant SET published = true WHERE id = ${org.restaurantId}`
    const [{ id: catId }] = await sql<{ id: string }[]>`
      INSERT INTO category (id, menu_id, restaurant_id, name, position, updated_at)
      VALUES (gen_random_uuid()::text, ${org.menuId}, ${org.restaurantId}, 'Mains', 0, now())
      RETURNING id
    `
    await sql`
      INSERT INTO item (id, category_id, restaurant_id, name, description, price_cents, currency, available, position, updated_at)
      VALUES
        (gen_random_uuid()::text, ${catId}, ${org.restaurantId}, 'Steak frites', 'House cut, peppercorn jus', 1850, 'EUR', true, 0, now()),
        (gen_random_uuid()::text, ${catId}, ${org.restaurantId}, 'Risotto', null, 1450, 'EUR', false, 1, now())
    `

    const res = await page.goto(`/r/${org.slug}`)
    expect(res?.status()).toBe(200)

    await expect(page.getByRole('heading', { name: 'Published Bistro' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mains' })).toBeVisible()
    await expect(page.getByText('Steak frites')).toBeVisible()
    await expect(page.getByText('House cut, peppercorn jus')).toBeVisible()
    await expect(page.getByText('€18.50')).toBeVisible()

    // Sold-out item still appears, but is marked as such
    await expect(page.getByText('Risotto')).toBeVisible()
    await expect(page.getByText('Sold out')).toBeVisible()
    await expect(page.getByText('€14.50')).toBeVisible()
  })

  test('admin email and org-only data are not exposed to anonymous visitors', async ({
    page,
    request,
  }) => {
    const owner = uniqueUser('isolation')
    await apiSignup(request, owner)
    const org = await apiCreateAndActivateOrg(
      request,
      'Isolation Bistro',
      uniqueSlug('iso'),
    )

    const sql = testDb()
    await sql`UPDATE restaurant SET published = true WHERE id = ${org.restaurantId}`

    const html = await (await page.goto(`/r/${org.slug}`))!.text()
    expect(html).not.toContain(owner.email)
    expect(html).not.toContain('/dashboard')
  })
})

test.describe('Publish toggle wires admin → public', () => {
  test('publishing makes the public page reachable; unpublishing 404s it', async ({
    page,
    browser,
  }) => {
    const owner = uniqueUser('toggle')
    await apiSignup(page.request, owner)
    const org = await apiCreateAndActivateOrg(
      page.request,
      'Toggle Bistro',
      uniqueSlug('toggle'),
    )

    // Open the admin restaurant page and click Publish
    await page.goto(`/dashboard/r/${org.slug}`)
    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible()

    // Anonymous visitor can now see the menu
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anonPage = await anon.newPage()
    const res1 = await anonPage.goto(`/r/${org.slug}`)
    expect(res1?.status()).toBe(200)
    await expect(anonPage.getByRole('heading', { name: 'Toggle Bistro' })).toBeVisible()
    await anon.close()

    // Owner unpublishes
    await page.getByRole('button', { name: 'Unpublish' }).click()
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible()

    // Anonymous visitor now gets 404
    const anon2 = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const anonPage2 = await anon2.newPage()
    const res2 = await anonPage2.goto(`/r/${org.slug}`, { waitUntil: 'commit' })
    expect(res2?.status()).toBe(404)
    await anon2.close()
  })
})
