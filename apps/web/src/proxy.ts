import { NextRequest, NextResponse } from 'next/server'
import { publicUrl } from '@iedora/product-menu/shared/url'
import { resolveRefresh, applyCookieWrites, authConfig } from '@iedora/auth-sdk/next/middleware'

import { surfaces, surfaceByHost } from './generated/surfaces'
import { surfaceAuthFor, surfaceSignInUrl } from './surface-auth'

/**
 * Three jobs in order of precedence:
 *
 *   1. **Host-based rewrites** — for hosts whose surface has a
 *      `rewritePath` (e.g. `iedora.com → /house/*`, `menu.iedora.com
 *      → /menu/*`). The matched surface comes from the hand-maintained
 *      registry at `./generated/surfaces.ts`.
 *
 *   2. **Cross-host guard** for namespace paths. Direct visits to
 *      another surface's namespace (`menu.iedora.com/house*`)
 *      404 — except `localhost` where every
 *      surface keeps its path-based fallback for plain local dev
 *      without `*.localhost` gymnastics.
 *
 *   3. **Auth gate + token refresh** for menu's protected prefixes.
 *      This middleware is the ONE place that refreshes an expired
 *      access token for page loads: RSCs can't mutate cookies, so the
 *      refresh happens here and the request's Cookie header is
 *      rewritten so downstream server components always read a valid
 *      `iedora_access` cookie. Authorization proper stays with the
 *      services — every API call is verified there.
 */
export default async function proxy(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0] ?? ''
  const path = req.nextUrl.pathname

  // 0. Public-menu view beacon → menu service, proxied at RUNTIME. This used to
  //    live in next.config rewrites(), but Next freezes a rewrite's destination
  //    at BUILD time — and the Docker build has no MENU_URL, so the
  //    `localhost:8184` fallback got baked into the image and every beacon 500'd
  //    in prod (no views were recorded). Doing it here reads MENU_URL at
  //    runtime. Same-origin (the browser still calls menu.iedora.com/track/...),
  //    so the menu service's visitor cookie stays first-party.
  if (path === '/track' || path.startsWith('/track/')) {
    const base = process.env.MENU_URL ?? 'http://localhost:8184'
    return NextResponse.rewrite(new URL(`/public${path}${req.nextUrl.search}`, base))
  }

  const here = surfaceByHost(host)

  // 1. Host-based rewrite for surfaces with a rewritePath set.
  //
  // The rewrite is **idempotent**: if the path already starts with the
  // surface's `rewritePath` (e.g. `menu.iedora.com/menu/onboarding`),
  // we don't prepend again. Double-prefixing produced URLs that 404'd
  // in prod even though the same internal route worked.
  //
  // The rewrite target is computed here but the response is built at
  // the END, so the auth gate below also covers rewritten paths
  // (`menu.iedora.com/dashboard` → internal `/menu/dashboard`).
  let internalPath = path
  let rewrite = false
  if (here && here.rewritePath) {
    const alreadyPrefixed =
      path === here.rewritePath || path.startsWith(`${here.rewritePath}/`)
    if (!alreadyPrefixed) {
      internalPath = path === '/' ? here.rewritePath : `${here.rewritePath}${path}`
      rewrite = true
    }
  }

  // 1b. Plain-localhost alias fallback — surfaces may declare
  //     `aliasPaths` (top-level URL segments their slices emit without
  //     the rewritePath prefix, because they run under a subdomain in
  //     prod and rely on rule 1 to add the prefix). On bare `localhost`
  //     no surface matches, so without this branch those paths 404.
  //     Subdomain hosts (`menu.localhost`, …) go
  //     through rule 1 above and never reach here.
  if (!here && host === 'localhost') {
    for (const s of surfaces) {
      if (!s.rewritePath || !s.aliasPaths?.length) continue
      const match = s.aliasPaths.some(
        (p) => path === p || path.startsWith(`${p}/`),
      )
      if (!match) continue
      internalPath = `${s.rewritePath}${path}`
      rewrite = true
      break
    }
  }

  // 2. Cross-host guard — visiting another surface's namespace from
  //    a host that doesn't own it. `localhost` (the dev catch-all)
  //    keeps the path-based fallback so every surface's /<name>/*
  //    works without `*.localhost` /etc/hosts gymnastics.
  for (const s of surfaces) {
    if (!s.rewritePath) continue
    if (here && here.name === s.name) continue
    if (path !== s.rewritePath && !path.startsWith(`${s.rewritePath}/`)) continue
    if (host === 'localhost') continue
    return new NextResponse('Not Found', { status: 404 })
  }

  // 3. Auth gate on the INTERNAL path (covers rewritten visits too). Per-surface:
  //    each surface refreshes its OWN cookie/tenant via the shared resolveRefresh
  //    primitive — the one place a page-load refresh happens (RSCs can't set
  //    cookies), so downstream server components always read a valid token.
  const sa = surfaceAuthFor(internalPath)
  const isProtected = sa?.protectedPrefixes.some((p) => internalPath.startsWith(p)) ?? false
  if (!sa || !isProtected) {
    return respond(req, internalPath, rewrite)
  }

  const auth = await resolveRefresh(authConfig, req)
  if (!auth.access) {
    // No session → the surface's sign-in, with `next` (an absolute URL on THIS
    // host) so after auth the user lands back on the route they tried to reach.
    const res = NextResponse.redirect(surfaceSignInUrl(sa, publicUrl(path).toString()))
    return applyCookieWrites(res, auth.cookieWrites) // also clears dead cookies
  }

  // Vantage (the platform super-admin console) needs the platform:admin role, not
  // just a session. Cheap unverified edge pre-filter — the layout's requireSuperAdmin
  // is the real JWKS-verified gate; here we 404 non-admins before the RSC renders.
  if (internalPath.startsWith('/tutor/vantage') && !hasPlatformAdmin(auth.access)) {
    return applyCookieWrites(new NextResponse('Not Found', { status: 404 }), auth.cookieWrites)
  }

  const res = respond(req, internalPath, rewrite, auth.requestHeaders)
  return applyCookieWrites(res, auth.cookieWrites)
}

/** Unverified decode of the `roles` claim — an edge fast-path only (real
 *  verification is JWKS-based in the page). */
function hasPlatformAdmin(token: string): boolean {
  try {
    const part = token.split('.')[1]
    if (!part) return false
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      roles?: string[]
    }
    return Array.isArray(claims.roles) && claims.roles.includes('platform:admin')
  } catch {
    return false
  }
}

/** Builds the pass-through/rewrite response, optionally swapping the
 *  request headers (used to forward a just-refreshed access cookie). */
function respond(
  req: NextRequest,
  internalPath: string,
  rewrite: boolean,
  requestHeaders?: Headers,
): NextResponse {
  const request = requestHeaders ? { headers: requestHeaders } : undefined
  if (!rewrite) return NextResponse.next({ request })
  const url = req.nextUrl.clone()
  url.pathname = internalPath
  return NextResponse.rewrite(url, { request })
}

export const config = {
  // `up` and `api` are excluded — infra plumbing that serves every host
  // unchanged. `/track` IS matched now: the beacon proxy in rule 0 above
  // rewrites it to the menu service at runtime (the old next.config rewrite
  // baked the wrong destination at build time).
  matcher: ['/((?!api|up|_next/static|_next/image|.*\\.png$).*)'],
}
