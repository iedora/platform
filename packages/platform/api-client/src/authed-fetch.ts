import { authClient, authConfig, cookieNames, cookieOptions } from '@iedora/auth-sdk/next'
import { cookies } from 'next/headers'

const names = cookieNames(authConfig.cookiePrefix)

/**
 * Product-neutral authed fetch against an ABSOLUTE url with the caller's Bearer
 * token (the shared iedora-realm access cookie) + a one-shot 401-refresh retry:
 * on a 401 with a live refresh cookie it refreshes once via the centralized auth
 * client, persists the rotated SSO cookies (only possible in server actions /
 * route handlers — RSC reads are covered by the middleware refresh), and retries.
 *
 * Each product builds its own base-URL wrapper on top of this (menu:
 * `products/menu/src/shared/menu-fetch.ts`), so this carries no service base URL.
 */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const store = await cookies()

  const doFetch = (token: string | undefined) =>
    fetch(url, {
      ...init,
      cache: 'no-store',
      headers: {
        ...init.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

  let res = await doFetch(store.get(names.access)?.value)

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      res = await doFetch(refreshed)
    }
  }
  return res
}

/**
 * Rotate the shared-realm refresh token via the centralized auth client and
 * persist the new SSO cookies, returning the new access token — or null when
 * there's nothing to refresh with. Cookie writes throw outside server actions /
 * route handlers; in RSCs the middleware owns refresh, so a 401 there falls
 * through to the caller (typically a redirect to sign-in).
 */
async function tryRefresh(): Promise<string | null> {
  const store = await cookies()
  const refreshToken = store.get(names.refresh)?.value
  if (!refreshToken) return null
  let bundle
  try {
    bundle = await authClient.refresh(refreshToken)
  } catch {
    return null
  }
  const opts = cookieOptions(authConfig)
  try {
    store.set(names.access, bundle.accessToken, { ...opts, maxAge: 60 * 15 })
    store.set(names.refresh, bundle.refreshToken, { ...opts, maxAge: 60 * 60 * 24 * 30 })
  } catch {
    // RSC context: cookies are read-only here. The new token is still good for
    // THIS request's retry; the middleware persists on the next page load.
  }
  return bundle.accessToken
}
