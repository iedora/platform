/**
 * The two auth cookies the Next server owns, both HttpOnly. The auth service
 * returns the tokens in the JSON body (@iedora/auth-sdk TokenBundle); the BFF
 * owns the cookies under `Path=/`:
 *
 *  - `iedora_access`  — the access JWT; expires with the bundle's `expiresIn`.
 *  - `iedora_refresh` — the opaque refresh token; the bundle carries no refresh
 *    expiry, so the cookie gets a fixed lifetime matching the server's refresh
 *    TTL. A refresh that outlives the server session just 401s → re-auth.
 */

import type { TokenBundle } from '@iedora/auth-sdk'

export const ACCESS_COOKIE = 'iedora_access'
export const REFRESH_COOKIE = 'iedora_refresh'

/** Fixed refresh-cookie lifetime (seconds) — matches the auth service's 30-day
 *  refresh TTL (a shorter server session simply 401s the stale cookie). */
const REFRESH_MAX_AGE_S = 30 * 24 * 60 * 60

/** Cookie write in a shape both `cookies()` and NextResponse accept. */
export type CookieWrite = {
  name: string
  value: string
  options: {
    httpOnly: boolean
    secure: boolean
    sameSite: 'lax'
    path: string
    maxAge?: number
  }
}

const baseOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
} as const

/** Builds the cookie writes for a successful auth response (a TokenBundle from
 *  login/register/refresh). */
export function authCookies(tokens: TokenBundle): CookieWrite[] {
  return [
    {
      name: ACCESS_COOKIE,
      value: tokens.accessToken,
      options: { ...baseOptions, maxAge: tokens.expiresIn },
    },
    {
      name: REFRESH_COOKIE,
      value: tokens.refreshToken,
      options: { ...baseOptions, maxAge: REFRESH_MAX_AGE_S },
    },
  ]
}

/** Cookie writes that delete both auth cookies (sign-out / dead refresh). */
export function clearedAuthCookies(): CookieWrite[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) => ({
    name,
    value: '',
    options: { ...baseOptions, maxAge: 0 },
  }))
}

