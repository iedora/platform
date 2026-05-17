import { createHmac, randomBytes } from 'node:crypto'
import { type BrowserContext } from '@playwright/test'
import { getTestkitUrl } from './testkit'
import { testDb } from './db'

/** Test user input. */
export type SignInUser = {
  email: string
  name: string
  /** Defaults to a deterministic test password. */
  password?: string
}

/**
 * Better Auth's secret used by menu in the test environment. Must match
 * `BETTER_AUTH_SECRET` in `playwright.config.ts` because we sign the
 * session cookie with the same key Better Auth verifies it against.
 */
const MENU_SECRET =
  'test-secret-do-not-use-in-prod-test-secret-do-not-use-in-prod'

/**
 * Replicates `better-call`'s `signCookieValue` exactly: HMAC-SHA256 over
 * the raw value bytes, base64-encoded (NOT base64url, NOT no-padding — the
 * 44-char-trailing-`=` check in `getSignedCookie` requires it). Returns
 * `<token>.<sig>`; Playwright URL-encodes cookie values on the wire.
 */
function signCookieValue(value: string): string {
  const sig = createHmac('sha256', MENU_SECRET).update(value).digest('base64')
  return `${value}.${sig}`
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`
}

export type SignedInUser = {
  userId: string
  email: string
  name: string
  sessionToken: string
  accessToken: string
}

/**
 * Sign a user into menu by directly forging the rows Better Auth would
 * create after a successful OAuth callback:
 *
 *   1. Sign the user up against the testkit's Better Auth (over HTTP via
 *      the shim → testkit). The testkit becomes the canonical IdP record.
 *      The signup also gives us a session on the testkit (cookie in the
 *      response).
 *   2. Get an access token by minting a JWT through the shim's `/_test/jwt`
 *      helper — internally calls `signTestToken`. The identity slice
 *      reads it from `menu.account.access_token` and sends it as a Bearer
 *      to the shim, which extracts `sub` to authorise org calls.
 *   3. Insert matching rows into menu's local cache (user + account +
 *      session). Set the signed `better-auth.session_token` cookie on the
 *      browser context — the next navigation arrives at menu's dashboard.
 *
 * This is the FAST path. The OAuth handshake itself has its own dedicated
 * spec (`auth/full-handshake.spec.ts`); every other spec uses this to
 * stay under the per-test budget.
 */
export async function signInAs(
  context: BrowserContext,
  user: SignInUser,
): Promise<SignedInUser> {
  const testkitUrl = getTestkitUrl()
  const password = user.password ?? 'correct-horse-battery-staple'

  // Sign the user up against the testkit (idempotent: re-using the email
  // returns 422; we follow up with a lookup in that case).
  let userId: string
  const signUpRes = await fetch(`${testkitUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    // Better Auth CSRF: state-changing requests need an Origin header.
    headers: { 'content-type': 'application/json', origin: testkitUrl },
    body: JSON.stringify({ name: user.name, email: user.email, password }),
  })
  if (signUpRes.ok) {
    const json = (await signUpRes.json()) as { user?: { id?: string } }
    if (!json.user?.id) {
      throw new Error(
        `signInAs: testkit signUp returned no user id (status ${signUpRes.status})`,
      )
    }
    userId = json.user.id
  } else if (signUpRes.status === 422 || signUpRes.status === 400) {
    // Email already exists — sign in with the same password to recover the id.
    const signInRes = await fetch(`${testkitUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: testkitUrl },
      body: JSON.stringify({ email: user.email, password }),
    })
    if (!signInRes.ok) {
      throw new Error(
        `signInAs: testkit signIn fallback failed ${signInRes.status} ${await signInRes.text()}`,
      )
    }
    const json = (await signInRes.json()) as { user?: { id?: string } }
    if (!json.user?.id) {
      throw new Error('signInAs: testkit signIn returned no user id')
    }
    userId = json.user.id
  } else {
    throw new Error(
      `signInAs: testkit signUp failed ${signUpRes.status} ${await signUpRes.text()}`,
    )
  }

  // Mint an OAuth access token bound to this user via the shim's helper.
  const tokenRes = await fetch(`${testkitUrl}/_test/sign-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId,
      scopes: ['openid', 'profile', 'email', 'menu', 'org:read', 'org:admin'],
    }),
  })
  if (!tokenRes.ok) {
    throw new Error(
      `signInAs: shim sign-token failed ${tokenRes.status} ${await tokenRes.text()}`,
    )
  }
  const { token: accessToken } = (await tokenRes.json()) as { token: string }

  // Mirror rows into menu's local cache.
  const sql = testDb()
  const accountId = newId('acc')
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO "menu"."user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${userId}, ${user.name}, ${user.email}, true, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        updated_at = now()
    `
    await tx`
      INSERT INTO "menu"."account" (
        id, account_id, provider_id, user_id,
        access_token, scope, created_at, updated_at
      )
      VALUES (
        ${accountId}, ${userId}, 'genkan', ${userId},
        ${accessToken}, 'openid profile email menu org:read org:admin',
        now(), now()
      )
      ON CONFLICT DO NOTHING
    `
    await tx`
      UPDATE "menu"."account"
        SET access_token = ${accessToken}, updated_at = now()
      WHERE user_id = ${userId} AND provider_id = 'genkan'
    `
  })

  const sessionId = newId('sess')
  const sessionToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await sql`
    INSERT INTO "menu"."session" (
      id, expires_at, token, created_at, updated_at,
      ip_address, user_agent, user_id
    )
    VALUES (
      ${sessionId}, ${expiresAt}, ${sessionToken}, now(), now(),
      '127.0.0.1', 'e2e-fixture', ${userId}
    )
  `

  const cookieValue = signCookieValue(sessionToken)
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      expires: Math.floor(expiresAt.getTime() / 1000),
    },
  ])

  return { userId, email: user.email, name: user.name, sessionToken, accessToken }
}
