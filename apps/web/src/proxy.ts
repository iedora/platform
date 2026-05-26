import { NextRequest, NextResponse } from 'next/server'
import { publicUrl } from '@/shared/url'
import { signInUrl } from '@iedora/brand'

const protectedPrefixes = ['/dashboard', '/onboarding']

/**
 * Hosts served by the iedora.com brand page (instead of menu's app).
 * The CF Tunnel routes both `iedora.com` and `www.iedora.com` to the
 * same upstream; the proxy decides what to render based on Host.
 */
const houseHosts = new Set(['iedora.com', 'www.iedora.com'])

/**
 * Hosts served by the `core` product (auth + admin). Both subdomain
 * variants (`core.iedora.com` in prod, `core.localhost:<port>` in dev)
 * map to the same internal namespace, with the path-based fallback
 * `localhost:<port>/core/*` always available for plain local dev.
 */
function isCoreHost(host: string): boolean {
  if (host === 'core.iedora.com') return true
  if (host === 'core.localhost') return true
  return false
}

/**
 * better-auth's session cookie name. Used here only as an OPTIMISTIC
 * hint (cookie present ⇒ likely signed in) — the real session lookup
 * happens in the DAL via `auth.api.getSession()`. AGENTS.md hard rule #5.
 */
const SESSION_COOKIE = 'better-auth.session_token'

/**
 * Three jobs in order of precedence:
 *
 *   1. **Host-based rewrites** — for hosts that map onto an internal
 *      namespace (`iedora.com → /house/*`, `core.iedora.com → /core/*`).
 *
 *   2. **Cross-host guard** for namespace paths. Direct visits to
 *      `menu.iedora.com/house*` or `menu.iedora.com/core/*` 404 — the
 *      namespaces are reserved for the hosts that own them.
 *
 *   3. **Optimistic auth gate** for menu's protected prefixes. Real
 *      auth runs in the DAL via `verifySession()`.
 */
export default function proxy(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0] ?? ''
  const path = req.nextUrl.pathname

  // 1a. House host → rewrite under /house.
  if (houseHosts.has(host)) {
    const target = path === '/' ? '/house' : `/house${path}`
    const url = req.nextUrl.clone()
    url.pathname = target
    return NextResponse.rewrite(url)
  }

  // 1b. Core host → rewrite under /core.
  if (isCoreHost(host)) {
    // /core/<rest>. Root path lands at /core (the sign-in landing).
    const target = path === '/' ? '/core' : `/core${path}`
    const url = req.nextUrl.clone()
    url.pathname = target
    return NextResponse.rewrite(url)
  }

  // 2a. Direct visits to /house* from menu.iedora.com don't make sense —
  // the namespace is reserved for iedora.com. 404 to keep the URL
  // surface honest.
  if (path === '/house' || path.startsWith('/house/')) {
    return new NextResponse('Not Found', { status: 404 })
  }

  // 2b. Same guard for /core/*. EXCEPT on `localhost` (no subdomain) —
  // local dev relies on the path-based fallback to test the surface
  // without /etc/hosts gymnastics.
  if ((path === '/core' || path.startsWith('/core/')) && host !== 'localhost') {
    return new NextResponse('Not Found', { status: 404 })
  }

  // 3. Menu's optimistic auth check.
  const isProtected = protectedPrefixes.some((p) => path.startsWith(p))
  if (!isProtected) return NextResponse.next()

  const hasSession = req.cookies.has(SESSION_COOKIE)
  if (!hasSession) {
    // Cross-origin redirect to the core product's sign-in. `next` is an
    // absolute URL on THIS host (built via publicUrl) so after auth the
    // user lands back on the protected route they tried to reach.
    return NextResponse.redirect(signInUrl(publicUrl(path).toString()))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
