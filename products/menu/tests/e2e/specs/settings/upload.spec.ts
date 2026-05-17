import { expect, test } from '../../fixtures'
import { seedRestaurant, testDb } from '../../helpers/db'

test.describe('Identity — logo upload', () => {
  test.fixme(
    true,
    'TODO(test): wiring the image-upload UI requires a stable selector for ' +
      'the file-input + the presign endpoint. Skeleton is here; lift once' +
      ' the upload affordance is accessibility-labelled in restaurant-identity/ui.',
  )

  test('logo upload triggers presign + PUT, URL is persisted', async ({
    signInNewUser,
    seedOrg,
  }) => {
    const { context, page, user } = await signInNewUser('upload')
    const org = await seedOrg({
      name: 'Upload Bistro',
      slug: `upload-${Date.now().toString(36)}`,
      ownerId: user.userId,
    })
    await seedRestaurant(org.id, 'Upload Bistro', org.slug)

    // Capture network: assert the presign + the PUT to LocalStack.
    const presignSeen = page.waitForRequest((req) =>
      req.url().includes('/api/upload/presign'),
    )
    const putSeen = page.waitForRequest(
      (req) => req.method() === 'PUT' && req.url().includes('localhost:4566'),
    )

    await page.goto(`/dashboard/r/${org.slug}/theme`)

    const fileInput = page.locator('input[type="file"]').first()
    await expect(fileInput).toHaveCount(1)
    await fileInput.setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      // 1x1 transparent PNG
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9aGUUE0AAAAASUVORK5CYII=',
        'base64',
      ),
    })

    await presignSeen
    await putSeen

    // Persisted on the restaurant row.
    const sql = testDb()
    await expect
      .poll(async () => {
        const [row] = await sql<{ logo_url: string | null }[]>`
          SELECT logo_url FROM "menu"."restaurant" WHERE slug = ${org.slug}
        `
        return row?.logo_url
      })
      .not.toBeNull()

    await context.close()
  })
})
