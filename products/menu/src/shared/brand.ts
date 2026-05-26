/**
 * Single source of truth for brand + public URLs that appear in the UI.
 *
 * Static / safe in both server and client components. For RUNTIME urls
 * (CORS origin, auth callbacks) read `env.MENU_PUBLIC_URL` /
 * `env.IEDORA_CORE_BASE_URL` from `@/shared/env` instead — those are
 * server-validated.
 */
export const BRAND_DOMAIN = 'iedora.com'

export const BRAND_NAME = 'iedora'
export const BRAND_URL = `https://${BRAND_DOMAIN}`
export const CONTACT_EMAIL = `hello@${BRAND_DOMAIN}`

// The Menu app lives on a `menu.` subdomain of the brand.
export const APP_HOSTNAME = `menu.${BRAND_DOMAIN}`
export const APP_URL = `https://${APP_HOSTNAME}`

// The Core product (auth + admin) lives on a `core.` subdomain. ALL
// auth flows funnel through it so cookies + sessions issue from a
// single canonical origin and SSO across iedora products works
// transparently.
//
// Source: `NEXT_PUBLIC_CORE_URL` — inlined by Next at build time.
// Prod: `https://core.iedora.com` (bare host; proxy.ts rewrites under
// /core/* internally).
// Dev: `http://localhost:3000/core` (path-based — no /etc/hosts
// dance for the operator).
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
  const base = `${CORE_URL}${SIGN_IN_PATH}`
  if (!next) return base
  return `${base}?next=${encodeURIComponent(next)}`
}

export function signUpUrl(next?: string): string {
  const base = `${CORE_URL}${SIGN_UP_PATH}`
  if (!next) return base
  return `${base}?next=${encodeURIComponent(next)}`
}

export function signOutUrl(next?: string): string {
  const base = `${CORE_URL}${SIGN_OUT_PATH}`
  if (!next) return base
  return `${base}?next=${encodeURIComponent(next)}`
}
