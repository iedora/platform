import { expect, test } from '@playwright/test'

/**
 * Routing + guards — resolved by the proxy middleware and RSCs without a backend
 * call (no session cookie → null session → redirect; unknown route → not-found).
 */
test('the dashboard redirects unauthenticated visitors to the central sign-in', async ({ page }) => {
  await page.goto('/menu/dashboard')
  // Sign-in now lives on the central auth surface (BRAND_URL/house in dev).
  await expect(page).toHaveURL(/\/house\/sign-in/)
  await expect(page.getByText('Welcome back')).toBeVisible()
})

test('an unknown route renders the custom 404', async ({ page }) => {
  const res = await page.goto('/menu/does-not-exist-' + Date.now())
  expect(res?.status()).toBe(404)
  await expect(page.getByText('404')).toBeVisible()
})
