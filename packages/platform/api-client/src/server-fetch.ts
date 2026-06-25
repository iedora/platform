import { cookies } from 'next/headers'

import { refreshTokens } from './auth-api'
import { ACCESS_COOKIE, REFRESH_COOKIE, authCookies, type CookieWrite } from './cookies'
import { MENU_URL } from './config'
import { ApiError } from './error'

/**
 * Fetch against the menu API with the caller's Bearer token.
 *
 * `path` is service-relative (e.g. `/api/restaurants`); absolute URLs
 * pass through for other services. On a 401 with a live refresh cookie
 * it refreshes once, persists the new cookies (only possible in server
 * actions / route handlers — RSC reads are covered by the middleware
 * refresh), and retries.
 */
export async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${MENU_URL}${path}`
  return authedFetch(url, init)
}

/**
 * Core authed fetch against an ABSOLUTE url with the caller's Bearer
 * token + the same one-shot 401-refresh retry as serverFetch. Shared
 * with the Hono RPC client (`menu-rpc`), which builds full URLs itself.
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

/** serverFetch + JSON decode, throwing ApiError on non-2xx. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await serverFetch(path, init)
  if (!res.ok) {
    // Surface the service's real message. Read the body as text once, then
    // prefer a JSON `{ error }` shape, else use the raw text (Hono's
    // HTTPException returns the message as a plain-text body). Falls back to
    // the status text only when there's no body at all.
    let message = res.statusText
    const text = await res.text().catch(() => '')
    if (text) {
      try {
        const body = JSON.parse(text) as unknown
        message =
          body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : text
      } catch {
        message = text
      }
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
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
    for (const c of authCookies(result.tokens, result.setCookies)) {
      writeCookie(store, c)
    }
  } catch {
    // RSC context: cookies are read-only here. The new token is still
    // good for THIS request's retry; middleware persists on the next.
  }
  return result.tokens.accessToken
}

function writeCookie(store: Awaited<ReturnType<typeof cookies>>, c: CookieWrite): void {
  store.set(c.name, c.value, c.options)
}
