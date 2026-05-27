/**
 * Public URL surface of the `core` product.
 *
 * Owns the absolute URL where the core product is reachable today
 * (the auth/admin shell) and the canonical paths under it. Other
 * products that need to send users into auth — sign-in redirects,
 * post-impersonate bounce-back, etc. — import these helpers; they
 * never hardcode the URL or its segments.
 *
 * Source of `CORE_URL`: `NEXT_PUBLIC_CORE_URL`, inlined by Next at
 * build time.
 *   - Prod: `https://core.iedora.com` — bare host; `apps/web/src/proxy.ts`
 *     rewrites it under `/core/*` on the shared Next.js binary.
 *   - Dev:  `http://localhost:3000/core` — path-based fallback so no
 *     `/etc/hosts` dance is needed locally.
 *
 * Future-proof: when `core` is lifted into its own deployment (Next.js
 * instance, microservice, whatever), `NEXT_PUBLIC_CORE_URL` is the
 * single env var to flip. Consumers' import paths don't change.
 *
 * Pure strings + URL builders — no env validation, no I/O, safe to
 * import from server AND client components.
 */

import { PRODUCTS, productUrl } from '@iedora/brand'

// Core's own absolute URL + canonical paths. Internal: the only
// public surface of this module are the three URL builders below.
// External consumers that want core's URL itself reach for
// `productUrl(PRODUCTS.core)` directly from `@iedora/brand`.
const CORE_URL = productUrl(PRODUCTS.core)
const SIGN_IN_PATH = '/sign-in'
const SIGN_UP_PATH = '/sign-up'
const SIGN_OUT_PATH = '/sign-out'

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
