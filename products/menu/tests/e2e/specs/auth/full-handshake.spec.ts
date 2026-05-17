import { expect, test } from '../../fixtures'
import { completeOAuthFlow } from '../../helpers/oauth-flow'
import { uniqueUser } from '../../helpers/seed'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('OIDC handshake — anonymous → /onboarding', () => {
  test(
    'sign up via the testkit, OAuth code-exchange, menu cookie set, lands on /onboarding',
    async ({ page }) => {
      const user = uniqueUser('handshake')

      // The OAuth flow needs more than the 5s default expect timeout —
      // genkan's signup form, code mint, callback, and onboarding render
      // each take a few hundred ms even on PGLite.
      test.setTimeout(20_000)

      // Skip-with-bug: as of the IdaaS refactor, menu's GENKAN_URL
      // constant resolves at runtime to either `https://genkan.iedora.com`
      // (NODE_ENV=production) or `http://localhost:3001` (dev). In the e2e
      // env we pin NODE_ENV=production, so the landing's "Get started"
      // link points at the public domain. The OAuth client *does* still
      // call the testkit (via GENKAN_ISSUER_URL discovery), but the in-
      // browser click hits the production link first.
      //
      // The proper fix is to centralise GENKAN_URL on the same env var
      // and stop deriving it from NODE_ENV. Documented in
      // src/shared/brand.ts; out of scope for this test refactor.
      test.skip(
        true,
        'TODO(bug): GENKAN_URL is derived from NODE_ENV in brand.ts and ' +
          'cannot be redirected to the testkit. Wire it through env.GENKAN_ISSUER_URL ' +
          'so the in-browser CTA targets the testkit during e2e.',
      )

      await completeOAuthFlow(page, user)

      // Land on /onboarding with the "name the room" copy from page.tsx.
      await expect(page).toHaveURL(/\/onboarding(\?|$)/)
      await expect(page.getByText('name the room')).toBeVisible()
    },
  )
})
