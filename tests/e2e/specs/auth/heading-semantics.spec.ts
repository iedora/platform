import { expect, test } from '@playwright/test'

// Failing-first: shadcn's CardTitle ships as a <div>, so screen readers don't
// announce signup/login titles as headings. These pages should expose a real
// h1 — they're standalone full-page forms with no other top-level heading.
//
// Failing now means: CardTitle is a div. After adding an `as` prop and
// passing as="h1" on auth pages, both assertions pass.
test.describe('Auth page heading semantics', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('signup page exposes an h1 with the signup title', async ({ page }) => {
    await page.goto('/signup')
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Create your Meta Menu account',
      }),
    ).toBeVisible()
  })

  test('login page exposes an h1 with the login title', async ({ page }) => {
    await page.goto('/login')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Log in to Meta Menu' }),
    ).toBeVisible()
  })
})
