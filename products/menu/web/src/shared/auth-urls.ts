/**
 * Canonical auth-page URLs. Credential exchange (sign-in / sign-up /
 * forgot-password / reset-password) lives on the CENTRAL auth surface —
 * `iedora.com/sign-in` in prod (resolved via `brandUrl()`). Only sign-out
 * stays product-local under the menu surface (`menu.iedora.com/sign-out`).
 *
 * Pure strings + URL builders — no env validation, no I/O, safe to
 * import from server AND client components (and the proxy middleware).
 */

import { brandUrl, PRODUCTS, productUrl } from '@iedora/brand'

const SIGN_OUT_PATH = '/sign-out'

/**
 * Builds an absolute (central) sign-in URL. `next` should be an absolute URL
 * on a trusted iedora-family origin (redirect target after auth); the central
 * sign-in page re-validates.
 */
export function signInUrl(next?: string): string {
  return appendNext(`${brandUrl()}/sign-in`, next)
}

export function signUpUrl(next?: string): string {
  return appendNext(`${brandUrl()}/sign-up`, next)
}

/** Absolute (central) "forgot password" URL (request a reset link). */
export function forgotPasswordUrl(): string {
  return `${brandUrl()}/forgot-password`
}

/** Absolute (central) "reset password" URL, carrying the emailed token. */
export function resetPasswordUrl(token?: string): string {
  const base = `${brandUrl()}/reset-password`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export function signOutUrl(next?: string): string {
  return appendNext(`${productUrl(PRODUCTS.menu)}${SIGN_OUT_PATH}`, next)
}

function appendNext(base: string, next?: string): string {
  if (!next) return base
  return `${base}?next=${encodeURIComponent(next)}`
}
