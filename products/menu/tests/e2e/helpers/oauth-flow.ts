import { type Page, expect } from '@playwright/test'

/**
 * Drive the real OIDC handshake end-to-end: menu's "Get started" → bounce
 * to genkan-testkit's signup page (with OAuth params preserved) → fill
 * the form → testkit issues a code → menu's callback exchanges → menu
 * sets a session cookie → browser lands at /onboarding.
 *
 * Only used by `auth/full-handshake.spec.ts` — every other spec uses
 * `signInAs` (cookie-injection fast path) because the OAuth round trip
 * adds ~2-3s per test for no extra coverage.
 *
 * The testkit's signup page is its own Better Auth UI; selectors below
 * match the genkan signup form (which uses standard semantic HTML — see
 * products/genkan/src/app/(auth)/signup/signup-form.tsx).
 */
export async function completeOAuthFlow(
  page: Page,
  user: { email: string; name: string; password: string },
): Promise<void> {
  await page.goto('/')

  // The landing CTA wires `onClick={startGenkanSignIn}` which calls
  // `authClient.signIn.oauth2({ providerId: 'genkan' })` — a real OAuth
  // bounce that lands on the testkit's /login or /signup.
  await page.getByRole('link', { name: /Get started/i }).first().click()

  // Better Auth's generic-oauth lands on Genkan's /login first. From there
  // the user clicks through to /signup, OR if Genkan-testkit's auto-signup
  // route is exposed, we'll already be on it. Look for an email field.
  await page.waitForLoadState('domcontentloaded')

  // If we're on /login, switch to /signup. We do this by URL nav rather
  // than relying on link text (the genkan brand might rename the CTA).
  if (page.url().includes('/login')) {
    // Keep OAuth params — replace `/login` with `/signup` in the URL.
    const url = new URL(page.url())
    url.pathname = '/signup'
    await page.goto(url.toString())
  }

  await expect(page.getByLabel(/name/i)).toBeVisible()
  await page.getByLabel(/name/i).fill(user.name)
  await page.getByLabel(/email/i).fill(user.email)
  await page.getByLabel(/password/i).fill(user.password)
  await page
    .getByRole('button', { name: /sign up|create account|continue/i })
    .first()
    .click()

  // After submit, Genkan's signup-form resumes the OAuth code flow. The
  // browser bounces back to menu's /api/auth/oauth2/callback/genkan, which
  // sets a menu session cookie and redirects to /dashboard. Brand-new
  // users have no org yet, so the dashboard guard redirects to /onboarding.
  await page.waitForURL(/\/onboarding(\?|$)/, { timeout: 15_000 })
}
