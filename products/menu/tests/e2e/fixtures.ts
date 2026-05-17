/* eslint-disable react-hooks/rules-of-hooks
   --
   The fixture functions below take Playwright's `use` callback. Its name
   collides with React's `use` hook detector, but these are not hooks. */
import { test as base, type Page, type BrowserContext } from '@playwright/test'
import {
  seedUser,
  seedOrg,
  seedMember,
  uniqueUser,
} from './helpers/seed'
import { signInAs, type SignedInUser } from './helpers/sign-in'
import { truncateAll, testDb } from './helpers/db'

export { expect } from '@playwright/test'

type Fixtures = {
  /**
   * Aggregated error capture — anything dropped on the page (uncaught client
   * error, 5xx on document/RSC responses) gets pushed here. The `auto: true`
   * extension wraps the test and fails it on teardown if anything landed.
   *
   * Why: a Server Component that hands an inline `onClick` to a Client
   * `<Link>` crashes RSC ~5–30s into the test as an opaque locator timeout.
   * This fixture surfaces the real React message instead of a useless
   * Playwright stack.
   */
  pageErrors: string[]

  /**
   * A `Page` belonging to a fresh BrowserContext that's already had
   * `signInAs` run against it. Convenience for the 95% of specs that just
   * need "a logged-in user, no org yet". Specs that need a SPECIFIC user
   * (named, with org) should use the `signedInUser` factory below.
   *
   * Backed by `signedInContext` so the BrowserContext is the same one for
   * both the cookie and the page.
   */
  signedInPage: Page

  /** Factory: same as `signedInPage` but builds a fresh context per call. */
  signInNewUser: (label?: string) => Promise<{
    context: BrowserContext
    page: Page
    user: SignedInUser
  }>

  /** Re-exposed seed helpers, scoped to the test for discoverability. */
  seedUser: typeof seedUser
  seedOrg: typeof seedOrg
  seedMember: typeof seedMember

  /** TRUNCATE menu's tables. Specs rarely call this directly — `afterEach`
   *  in the base extension does. Exposed for the few specs that need a
   *  mid-test reset. */
  resetMenu: () => Promise<void>
}

export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []

      page.on('pageerror', (err) => {
        errors.push(`Uncaught client error: ${err.message}`)
      })

      page.on('response', async (response) => {
        if (response.status() < 500) return
        const ct = response.headers()['content-type'] ?? ''
        // Only document and RSC payloads — skip 5xx on assets/HMR/etc.
        if (!ct.startsWith('text/html') && !ct.startsWith('text/x-component'))
          return

        const body = await response.text().catch(() => '')
        const snippet =
          body.match(/"message":"([^"]+)"/)?.[1] ??
          body.match(/<pre[^>]*>([^<]+)<\/pre>/)?.[1] ??
          body.slice(0, 400)
        errors.push(
          `Server ${response.status()} on ${new URL(response.url()).pathname}\n  ${snippet}`,
        )
      })

      // Auto-emulate prefers-reduced-motion for every test by default so
      // animations don't dilate the timing budget. Specs that rely on the
      // animation behaviour (landing/anonymous → auto-cycle) override per-test.
      await page.emulateMedia({ reducedMotion: 'reduce' })

      await use(errors)

      if (errors.length > 0) {
        throw new Error(
          `Page reported ${errors.length} uncaught error(s):\n\n${errors.join('\n\n')}`,
        )
      }
    },
    { auto: true },
  ],

  resetMenu: async ({}, use, testInfo) => {
    await use(() => truncateAll())
    // afterEach: only the LAST test in a file might leave residue we care
    // about; truncate here keeps the next spec deterministic. We swallow
    // errors because Postgres might already be torn down on suite end.
    try {
      await truncateAll()
    } catch (err) {
      if (testInfo.status !== 'passed') {
        // Don't mask the real failure with a cleanup error.
        return
      }
      console.warn('[fixtures] truncate cleanup failed:', err)
    }
  },

  seedUser: async ({}, use) => {
    await use(seedUser)
  },
  seedOrg: async ({}, use) => {
    await use(seedOrg)
  },
  seedMember: async ({}, use) => {
    await use(seedMember)
  },

  signedInPage: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await signInAs(context, uniqueUser('signed'))
    await use(page)
    await context.close()
  },

  signInNewUser: async ({ browser }, use) => {
    const created: BrowserContext[] = []
    const helper = async (label = 'user') => {
      const context = await browser.newContext()
      created.push(context)
      const page = await context.newPage()
      const user = await signInAs(context, uniqueUser(label))
      return { context, page, user }
    }
    await use(helper)
    for (const c of created) await c.close()
  },
})

export { testDb }
