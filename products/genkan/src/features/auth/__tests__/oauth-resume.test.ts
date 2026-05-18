import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestGenkan, type TestGenkanHandle } from '@iedora/auth-testkit'

/**
 * Regression tests for the OAuth-authorize resume contract that genkan's
 * own /signup + /login forms rely on.
 *
 * The bug this guards against: the forms used to GET-navigate to
 * `/api/auth/oauth2/continue?<signed-query>`. That endpoint is POST-only
 * in `@better-auth/oauth-provider` 1.6.11, so the browser hit a 404 every
 * time a user signed up through menu. The fix wires `oauthProviderClient`
 * into genkan's auth client so the signed `oauth_query` rides along with
 * the regular `/sign-in/email` / `/sign-up/email` POST body — the
 * provider's before-hook captures it, the after-hook resumes the
 * authorize step when the session cookie is set, and Better Auth's
 * built-in `redirectPlugin` follows the resulting `data.url`.
 *
 * The load-bearing claims these tests pin:
 *
 *   1. POST /sign-in/email with `oauth_query` in the body returns
 *      `{ redirect: true, url: <client-callback>?code=…&state=… }`.
 *   2. Same for POST /sign-up/email — auto-sign-in means the same
 *      after-hook trigger fires.
 *   3. GET /oauth2/continue is NOT a valid resume target.
 *
 * If Better Auth ever changes the contract (renames `oauth_query`,
 * moves the after-hook, flips the endpoint method, …) these tests fail
 * before users hit a 404 on production sign-in.
 */

const PWD = 'correct-horse-battery-staple-1234'
const CLIENT_ID = 'menu'
const CLIENT_SECRET = 'menu-secret'
const CALLBACK = 'http://localhost:3000/api/auth/oauth2/callback/genkan'

let handle: TestGenkanHandle

beforeAll(async () => {
  handle = await startTestGenkan({
    clients: [
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uris: [CALLBACK],
      },
    ],
  })
})

afterAll(async () => {
  await handle.stop()
})

/**
 * Drive an unauthenticated GET /oauth2/authorize and pull the signed
 * query out of the resulting redirect-to-/login URL. Mirrors what a
 * browser would land on when menu kicks off the OAuth flow.
 *
 * `sec-fetch-mode: cors` flips Better Auth's redirect-handling from
 * a 302 to `{ redirect: true, url }` JSON — easier to parse.
 */
async function getSignedAuthorizeQuery(): Promise<string> {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: CALLBACK,
    scope: 'openid profile email menu',
    state: 'test-state',
    code_challenge: 'F7LfjPgZ9-gZDDJ84n_6iazN1GAobscdVLzFz_GESAE',
    code_challenge_method: 'S256',
  })
  const res = await fetch(
    `${handle.url}/api/auth/oauth2/authorize?${params.toString()}`,
    {
      headers: {
        accept: 'application/json',
        'sec-fetch-mode': 'cors',
      },
      redirect: 'manual',
    },
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as { redirect?: boolean; url?: string }
  expect(body.redirect).toBe(true)
  expect(body.url).toBeTruthy()
  const parsed = new URL(body.url!, handle.url)
  // Default flow with no prompt= lands on the login page.
  expect(parsed.pathname).toBe('/login')
  return parsed.search.replace(/^\?/, '')
}

describe('OAuth resume flow (regression: /oauth2/continue 404)', () => {
  it('resumes the authorize step when oauth_query is POSTed alongside /sign-in/email', async () => {
    const user = await handle.seed.user({
      name: 'Resume Signin',
      email: 'resume-signin@example.com',
      password: PWD,
    })

    const signedQuery = await getSignedAuthorizeQuery()

    // The shape produced by `oauthProviderClient` on a form submit at
    // /login?<signed>: credentials in the body PLUS oauth_query.
    const res = await fetch(`${handle.url}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'sec-fetch-mode': 'cors',
      },
      body: JSON.stringify({
        email: user.email,
        password: PWD,
        oauth_query: signedQuery,
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { redirect?: boolean; url?: string }
    expect(body.redirect).toBe(true)
    expect(body.url).toBeTruthy()

    const cb = new URL(body.url!)
    expect(`${cb.origin}${cb.pathname}`).toBe(CALLBACK)
    expect(cb.searchParams.get('code')).toBeTruthy()
    expect(cb.searchParams.get('state')).toBe('test-state')
  })

  it('resumes the authorize step when oauth_query is POSTed alongside /sign-up/email', async () => {
    const signedQuery = await getSignedAuthorizeQuery()

    const res = await fetch(`${handle.url}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'sec-fetch-mode': 'cors',
      },
      body: JSON.stringify({
        name: 'Resume Signup',
        email: `resume-signup-${Date.now()}@example.com`,
        password: PWD,
        oauth_query: signedQuery,
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { redirect?: boolean; url?: string }
    expect(body.redirect).toBe(true)
    expect(body.url).toBeTruthy()

    const cb = new URL(body.url!)
    expect(`${cb.origin}${cb.pathname}`).toBe(CALLBACK)
    expect(cb.searchParams.get('code')).toBeTruthy()
    expect(cb.searchParams.get('state')).toBe('test-state')
  })

  it('does NOT redirect to the client callback when oauth_query is missing', async () => {
    // Inverse of the two above: prove that the resume is gated on the
    // `oauth_query` body field. Without it, sign-in just signs in — no
    // OAuth code is issued. This pins the contract: the plugin is what
    // carries the OAuth state forward, not an ambient cookie.
    const user = await handle.seed.user({
      name: 'No Resume',
      email: 'no-resume@example.com',
      password: PWD,
    })

    const res = await fetch(`${handle.url}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'sec-fetch-mode': 'cors',
      },
      body: JSON.stringify({ email: user.email, password: PWD }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      redirect?: boolean
      url?: string
      user?: { id: string }
    }
    expect(body.redirect).toBeFalsy()
    expect(body.url).toBeFalsy()
    expect(body.user?.id).toBe(user.id)
  })

  it('rejects a tampered oauth_query with invalid_signature', async () => {
    // Belt-and-braces: the before-hook MUST verify the HMAC signature
    // before storing the query. A forged query that points at a
    // different redirect_uri (or a different client_id) would otherwise
    // hijack the code into an attacker-controlled callback.
    const user = await handle.seed.user({
      name: 'Tamper',
      email: 'tamper@example.com',
      password: PWD,
    })
    const signedQuery = await getSignedAuthorizeQuery()
    const tampered = signedQuery.replace(
      /redirect_uri=[^&]+/,
      `redirect_uri=${encodeURIComponent('https://attacker.example/callback')}`,
    )

    const res = await fetch(`${handle.url}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'sec-fetch-mode': 'cors',
      },
      body: JSON.stringify({
        email: user.email,
        password: PWD,
        oauth_query: tampered,
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string; message?: string }
    expect(body.error ?? body.message).toMatch(/invalid_signature/i)
  })

  it('does not resume via GET /api/auth/oauth2/continue (POST-only endpoint)', async () => {
    // The bug this whole suite guards against: the genkan forms used to
    // GET-navigate to `/api/auth/oauth2/continue?<signed-query>`. The
    // endpoint is registered as POST-only, so the browser hit a hard 404.
    // If anyone re-introduces a GET path that depends on this URL, this
    // test catches it before the user lands on the same broken page.
    const signedQuery = await getSignedAuthorizeQuery()
    const res = await fetch(
      `${handle.url}/api/auth/oauth2/continue?${signedQuery}`,
      { redirect: 'manual' },
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    // Specifically NOT a redirect — the bug was that browsers got a 404
    // page here, no redirect issued. Pin the negative.
    expect(res.headers.get('location')).toBeFalsy()
  })
})
