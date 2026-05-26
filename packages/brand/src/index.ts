/**
 * Iedora brand constants + cross-origin URL helpers.
 *
 * Single source of truth shared by every product. Pure strings + URL
 * builders + URL validators — no env validation, no runtime, safe to
 * import from server AND client components.
 *
 * For RUNTIME urls that must be ABSOLUTE to the running instance (CORS
 * origin, OIDC callbacks, ...) consumers read their own env vars
 * (`MENU_PUBLIC_URL`, `IEDORA_CORE_BASE_URL`, ...) — that is a product/
 * shell concern, not a brand one.
 */

export const BRAND_DOMAIN = 'iedora.com'
export const BRAND_NAME = 'iedora'
export const BRAND_URL = `https://${BRAND_DOMAIN}`
export const CONTACT_EMAIL = `hello@${BRAND_DOMAIN}`

// The Menu product lives on a `menu.` subdomain.
export const APP_HOSTNAME = `menu.${BRAND_DOMAIN}`
export const APP_URL = `https://${APP_HOSTNAME}`

// The Core product (auth + admin) lives on a `core.` subdomain. ALL
// auth flows funnel through it so cookies + sessions issue from a
// single canonical origin and SSO across iedora products works
// transparently.
//
// Source: `NEXT_PUBLIC_CORE_URL` — inlined by Next at build time.
// Prod: `https://core.iedora.com` (bare host; proxy.ts rewrites under
//        /core/* internally).
// Dev:  `http://localhost:3000/core` (path-based fallback — no
//        /etc/hosts dance for the operator).
export const CORE_URL: string =
  process.env.NEXT_PUBLIC_CORE_URL ?? `https://core.${BRAND_DOMAIN}`

// Page routes ON THE CORE HOST — append to `CORE_URL`.
export const SIGN_IN_PATH = '/sign-in'
export const SIGN_UP_PATH = '/sign-up'
export const SIGN_OUT_PATH = '/sign-out'

/**
 * Builds an absolute sign-in URL on the core product. `next` should be
 * an absolute URL on a trusted iedora-family origin (cross-product
 * redirect target after auth); the sign-in page re-validates.
 */
export function signInUrl(next?: string): string {
  return appendNext(`${CORE_URL}${SIGN_IN_PATH}`, next)
}

export function signUpUrl(next?: string): string {
  return appendNext(`${CORE_URL}${SIGN_UP_PATH}`, next)
}

export function signOutUrl(next?: string): string {
  return appendNext(`${CORE_URL}${SIGN_OUT_PATH}`, next)
}

function appendNext(base: string, next?: string): string {
  if (!next) return base
  return `${base}?next=${encodeURIComponent(next)}`
}

// ─── URL validators (no env, no I/O) ────────────────────────────────────

/**
 * Returns true iff `raw` is a same-origin path the app can safely
 * redirect to. Rejects absolute URLs (`http://evil`), protocol-relative
 * URLs (`//evil`), and the `/\` bypass trick.
 */
export function isSameOriginPath(raw: string | undefined | null): boolean {
  if (!raw) return false
  if (!raw.startsWith('/')) return false
  if (raw.startsWith('//')) return false
  if (raw.startsWith('/\\')) return false
  return true
}

/**
 * Returns true iff `raw` parses as an absolute URL on the iedora apex
 * or any of its subdomains (`iedora.com`, `menu.iedora.com`,
 * `core.iedora.com`, ...). `localhost` (any port) is also accepted so
 * the same validator works in dev.
 */
export function isSameIedoraOrigin(raw: string | undefined | null): boolean {
  if (!raw) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === BRAND_DOMAIN || host.endsWith(`.${BRAND_DOMAIN}`)) return true
  return false
}
