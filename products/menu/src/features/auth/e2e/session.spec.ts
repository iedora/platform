import { test, expect } from '../../../../tests/e2e/fixtures'
import { authRoutes, signOut } from '../testing'
import { dashboardRoutes } from '@/features/dashboard-home/testing'

/**
 * Auth slice specs — exercises the DAL guards' redirect behaviour and
 * the post-logout cookie clearing. The `signedInPage` fixture seals the
 * exact cookie production mints, so a visit to `/dashboard` must succeed
 * without an OIDC bounce.
 */

test.describe('@critical auth session', () => {
  test('signed-in user lands on the dashboard', async ({ signedInPage }) => {
    const res = await signedInPage.goto(dashboardRoutes.home)
    expect(res?.status()).toBeLessThan(400)
    // Dashboard chrome — verifySession() must NOT redirect.
    expect(signedInPage.url()).not.toContain('/api/auth/login')
  })

  test('unauthenticated request bounces through /api/auth/login', async ({ page }) => {
    const res = await page.goto(dashboardRoutes.home)
    // Either an immediate 302 → /api/auth/login or a render of the login
    // route (production OIDC start). Both are acceptable; what matters is
    // we did NOT render the dashboard.
    expect(page.url()).toMatch(/(\/api\/auth\/login|\/signup|\/login)/)
    expect(res?.status()).toBeLessThan(500)
  })

  test('signOut clears the cookie and forces re-auth', async ({ signIn }) => {
    const { context, page } = await signIn({
      email: 'logout@iedora.test',
      name: 'Logout User',
    })
    await page.goto(dashboardRoutes.home)
    expect(page.url()).not.toContain(authRoutes.login())

    await signOut(context)
    await page.goto(dashboardRoutes.home)
    expect(page.url()).toMatch(/(\/api\/auth\/login|\/signup|\/login)/)
  })
})
