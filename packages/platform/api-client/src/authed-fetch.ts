import { cookies } from 'next/headers'

import { refreshTokens } from './auth-api'
import { ACCESS_COOKIE, REFRESH_COOKIE, authCookies, type CookieWrite } from './cookies'

/**
 * Product-neutral authed fetch against an ABSOLUTE url with the caller's Bearer
 * token + a one-shot 401-refresh retry: on a 401 with a live refresh cookie it
 * refreshes once, persists the new cookies (only possible in server actions /
 * route handlers — RSC reads are covered by the middleware refresh), and retries.
 *
 * Each product builds its own base-URL wrapper on top of this (menu:
 * `products/menu/src/shared/menu-fetch.ts`; tutor: `products/tutor/src/api/`),
 * so this foundation package carries no service-specific base URL.
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

  let res = await doFetch(store.get(ACCESS_COOKIE)?.value)

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      res = await doFetch(refreshed)
    }
  }
  return res
}

/**
 * Refreshes the access token and persists both cookies, returning the
 * new access token — or null when there is nothing to refresh with.
 * Cookie writes throw outside server actions / route handlers; in RSCs
 * the middleware owns refresh, so a 401 there falls through to the
 * caller (typically a redirect to sign-in).
 */
async function tryRefresh(): Promise<string | null> {
  const store = await cookies()
  const refreshToken = store.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return null
  const result = await refreshTokens(refreshToken)
  if (!result) return null
  try {
    for (const c of authCookies(result)) {
      writeCookie(store, c)
    }
  } catch {
    // RSC context: cookies are read-only here. The new token is still
    // good for THIS request's retry; middleware persists on the next.
  }
  return result.accessToken
}

function writeCookie(store: Awaited<ReturnType<typeof cookies>>, c: CookieWrite): void {
  store.set(c.name, c.value, c.options)
}
