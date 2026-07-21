import { createAuthClient } from "@iedora/auth-sdk"
import { type NextRequest, NextResponse } from "next/server"

import {
  type AuthNextConfig,
  cookieNames,
  cookieOptions,
  DEFAULT_ACCESS_MAX_AGE,
  DEFAULT_REFRESH_MAX_AGE,
} from "./config"

/** Cheap, unverified expiry check (real verification is in getClaims). A 30s skew
 *  refreshes slightly early so a request never races expiry. */
function expired(jwt: string): boolean {
  try {
    const payload = jwt.split(".")[1]
    if (!payload) return true
    const { exp } = JSON.parse(atob(payload)) as { exp?: number }
    return !exp || exp * 1000 < Date.now() + 30_000
  } catch {
    return true
  }
}

/** A cookie to stamp on the outgoing response. */
export type CookieWrite = { name: string; value: string; options: Record<string, unknown> }

/** The outcome of resolving (and refreshing) the session cookies for one request. */
export type RefreshResolution = {
  /** The current or freshly-refreshed access token; undefined = signed out. */
  access?: string
  /** Cookie writes to stamp on the response — refreshed pair, or deletions. */
  cookieWrites: CookieWrite[]
  /** Replacement request headers when a refresh rewrote the cookies, so Server
   *  Components rendered on THIS request read the fresh token. */
  requestHeaders?: Headers
}

/**
 * Resolve a product's session for a Next request, refreshing an expired access
 * token from the refresh cookie. Composable — call it from any middleware (a
 * single-product `createRefreshMiddleware`, or a multi-surface proxy that runs
 * it per surface with that surface's config). Edge-safe: fetch + cookies only.
 * Never verifies signatures (that's `getClaims`); a stale token is refreshed and
 * a dead refresh token is cleared.
 */
export async function resolveRefresh(
  config: AuthNextConfig,
  req: NextRequest,
): Promise<RefreshResolution> {
  const names = cookieNames(config.cookiePrefix)
  const opts = cookieOptions(config)
  const access = req.cookies.get(names.access)?.value
  const refresh = req.cookies.get(names.refresh)?.value

  if (access && !expired(access)) return { access, cookieWrites: [] }
  if (!refresh) return { cookieWrites: [] }

  try {
    const client = createAuthClient({ baseUrl: config.baseUrl, tenant: config.tenant })
    const bundle = await client.refresh(refresh)
    const cookieWrites: CookieWrite[] = [
      {
        name: names.access,
        value: bundle.accessToken,
        options: { ...opts, maxAge: config.accessMaxAge ?? DEFAULT_ACCESS_MAX_AGE },
      },
      {
        name: names.refresh,
        value: bundle.refreshToken,
        options: { ...opts, maxAge: config.refreshMaxAge ?? DEFAULT_REFRESH_MAX_AGE },
      },
    ]
    return {
      access: bundle.accessToken,
      cookieWrites,
      requestHeaders: withCookies(req, cookieWrites),
    }
  } catch {
    // Dead refresh token → clear both cookies (signed out).
    return {
      cookieWrites: [
        { name: names.access, value: "", options: { ...opts, maxAge: 0 } },
        { name: names.refresh, value: "", options: { ...opts, maxAge: 0 } },
      ],
    }
  }
}

/** Stamp resolved cookie writes onto a response. */
export function applyCookieWrites(res: NextResponse, writes: CookieWrite[]): NextResponse {
  for (const c of writes) res.cookies.set(c.name, c.value, c.options)
  return res
}

/** Clone the request headers with the refreshed cookie values folded in. */
function withCookies(req: NextRequest, writes: CookieWrite[]): Headers {
  const jar = new Map(req.cookies.getAll().map((c) => [c.name, c.value]))
  for (const c of writes) jar.set(c.name, c.value)
  const headers = new Headers(req.headers)
  headers.set(
    "cookie",
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
  )
  return headers
}

/**
 * Next.js middleware that keeps ONE product's access-token cookie fresh — a thin
 * wrapper over {@link resolveRefresh}. When the access token is missing/expired
 * but a refresh token is present, it rotates at the auth service and re-sets both
 * cookies so Server Components (which can't set cookies) see a valid token. A
 * failed refresh clears them (signed out). For a multi-surface app, call
 * `resolveRefresh` per surface from the proxy instead.
 */
export function createRefreshMiddleware(config: AuthNextConfig) {
  return async function middleware(req: NextRequest): Promise<NextResponse> {
    const r = await resolveRefresh(config, req)
    const res = NextResponse.next(
      r.requestHeaders ? { request: { headers: r.requestHeaders } } : undefined,
    )
    return applyCookieWrites(res, r.cookieWrites)
  }
}
