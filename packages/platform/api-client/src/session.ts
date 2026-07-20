import { cookies } from 'next/headers'

import { refreshTokens } from './auth-api'
import { ACCESS_COOKIE, REFRESH_COOKIE, authCookies } from './cookies'
import { decodeJwt } from './jwt'

/** The signed-in principal, decoded from the access-token cookie. */
export type Session = {
  userId: string
  tenantId: string | null
  roles: string[]
  email: string | null
  /** Force-change flag from the `mcp` claim. When false (the common case) the
   *  dashboard guard skips its live DB check entirely. */
  mustChangePassword: boolean
  /** Access-token expiry (unix ms). Middleware refreshes before this. */
  expiresAt: number
}

/** Decodes a session from a raw access token; null if invalid/expired. */
export function sessionFromToken(token: string): Session | null {
  const claims = decodeJwt(token)
  if (!claims || claims.typ !== 'access') return null
  if (claims.exp * 1000 <= Date.now()) return null
  return {
    userId: claims.sub,
    tenantId: claims.org ?? null,
    roles: claims.roles ?? [],
    email: claims.email ?? null,
    mustChangePassword: claims.mcp === true,
    expiresAt: claims.exp * 1000,
  }
}

/**
 * Reads the session, self-healing an expired access token from the
 * refresh cookie.
 *
 * Refresh happens in three places, by request type:
 *   - page navigations  → the proxy middleware (refreshes + persists)
 *   - backend data calls → `serverFetch` (refreshes on 401 + retries)
 *   - the guards here    → this function, for server actions
 *
 * IMPORTANT: refresh tokens rotate, so a refresh MUST persist the new
 * token. In an RSC the cookie store is read-only and the middleware
 * already owns refresh, so we never rotate there — orphaning a rotated
 * token would trip the auth service's reuse-detection and revoke the
 * session. We only self-heal where cookie writes are allowed (a server
 * action / route handler).
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  const access = store.get(ACCESS_COOKIE)?.value
  const session = access ? sessionFromToken(access) : null
  if (session) return session

  const refreshToken = store.get(REFRESH_COOKIE)?.value
  if (!refreshToken || !canWriteCookies(store)) return null

  const result = await refreshTokens(refreshToken)
  if (!result) return null
  for (const c of authCookies(result)) {
    store.set(c.name, c.value, c.options)
  }
  return sessionFromToken(result.accessToken)
}

/**
 * True only in a Server Action / Route Handler, where mutating cookies is
 * allowed; a throw means we're rendering an RSC (read-only store). The probe
 * deletes a name that's never used, so it never touches real cookies.
 */
function canWriteCookies(store: Awaited<ReturnType<typeof cookies>>): boolean {
  try {
    store.set('__iedora_rt_probe', '', { maxAge: 0, path: '/' })
    return true
  } catch {
    return false
  }
}
