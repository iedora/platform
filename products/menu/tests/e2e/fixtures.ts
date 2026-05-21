/* eslint-disable react-hooks/rules-of-hooks */
// Playwright fixtures take a parameter named `use` (test-runner contract).
// The react-hooks plugin mistakes those calls for the React 19 `use()` hook,
// so the rule is silenced for this file. There is no React in here.

import { test as base, type Page, type BrowserContext } from '@playwright/test'
import { truncateAll } from '@/shared/testing/e2e-db'
import {
  signInAs,
  iedoraAdminProfile,
  type PermissionProfile,
  type SignedInUser,
} from '@/features/auth/testing'

export { expect } from '@playwright/test'

/**
 * Auto-fixtures shared by every E2E spec (slice-local and journey).
 *
 *  - `pageErrors`  fails the test if any uncaught client error or 5xx
 *                  response surfaces during the run.
 *  - `resetMenu`   truncates every menu schema table before AND after
 *                  the test. Pre-truncate keeps a stale fixture from a
 *                  killed prior run from poisoning the suite; post-
 *                  truncate is the usual hygiene.
 *  - `signedInPage` opens a context, signs in with the
 *                  `iedoraAdminProfile`, and yields the page. Use this
 *                  for admin-surface specs that don't need to express
 *                  scope intent themselves.
 *  - `signIn`      factory for specs that need multiple users or
 *                  explicit profiles — returns a helper that opens a
 *                  fresh context per call.
 */

type SignIn = (input: {
  email: string
  name: string
  profile?: PermissionProfile
  organizationId?: string
}) => Promise<{ context: BrowserContext; page: Page; user: SignedInUser }>

type Fixtures = {
  pageErrors: string[]
  resetMenu: () => Promise<void>
  signedInPage: Page
  signIn: SignIn
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
        if (!ct.startsWith('text/html') && !ct.startsWith('text/x-component')) return

        const body = await response.text().catch(() => '')
        const snippet =
          body.match(/"message":"([^"]+)"/)?.[1] ??
          body.match(/<pre[^>]*>([^<]+)<\/pre>/)?.[1] ??
          body.slice(0, 400)
        errors.push(
          `Server ${response.status()} on ${new URL(response.url()).pathname}\n  ${snippet}`,
        )
      })

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

  resetMenu: [
    async ({}, use, testInfo) => {
      // Pre-truncate so a killed prior run can't poison the suite.
      await truncateAll().catch(() => {})
      await use(async () => {
        await truncateAll()
      })
      try {
        await truncateAll()
      } catch (err) {
        if (testInfo.status !== 'passed') return
        console.warn('[fixtures] cleanup failed:', err)
      }
    },
    { auto: true },
  ],

  signedInPage: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await signInAs(context, {
      email: 'admin@iedora.test',
      name: 'Iedora Admin',
      profile: iedoraAdminProfile,
    })
    await use(page)
    await context.close()
  },

  signIn: async ({ browser }, use) => {
    const created: BrowserContext[] = []
    const helper: SignIn = async (input) => {
      const context = await browser.newContext()
      created.push(context)
      const page = await context.newPage()
      const user = await signInAs(context, {
        email: input.email,
        name: input.name,
        profile: input.profile ?? iedoraAdminProfile,
        organizationId: input.organizationId,
      })
      return { context, page, user }
    }
    await use(helper)
    for (const c of created) await c.close()
  },
})
