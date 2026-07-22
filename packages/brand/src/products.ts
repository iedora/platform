/**
 * Cross-product registry — names + URLs.
 *
 * Single source of truth for "which products exist?" and "where does
 * each product live?". Anyone who needs either calls into this module
 * — no magic strings, no per-call env reads. Zero cross-product
 * workspace dependency: the registry lives in `brand`, not in the
 * product itself.
 *
 * Per-product PATH BUILDERS (e.g. `signInUrl()`) still live inside
 * that product's package (`@iedora/product-menu/shared/auth-urls`).
 * Split:
 *
 *   - this file        → "which products exist? where do they live?"
 *   - product-X/url    → "how to build /foo under X"
 *
 * URL backing: each entry reads a PLAIN runtime env var (`<ID>_SURFACE_URL`,
 * NOT `NEXT_PUBLIC_*`) so the same image serves any environment — set the value
 * per deployment. Read server-side at request time; absent in the browser, where
 * it falls back to the prod host (only cosmetic links call this client-side).
 * `MENU_URL` is taken (the menu service), hence `MENU_SURFACE_URL`.
 *
 * Adding a product:
 *   1. Append the id to `PRODUCTS`.
 *   2. Add a `case` branch to `productUrl` (TypeScript exhaustiveness
 *      catches the missing branch).
 *   3. Set its `<ID>_SURFACE_URL` per environment (dev .env, infra deploy_env).
 *
 * Pure — no `server-only`, no I/O, safe for client + server.
 */

import { BRAND_DOMAIN } from './index.ts'

/**
 * The public hostname for a surface in THIS environment, from its runtime URL
 * env var — used by the host router (surfaces.ts / middleware), server-side.
 * Falls back to the prod host when unset or when the URL is localhost (dev,
 * where routing is path-based, not host-based), so dev and prod are unchanged.
 */
export function surfaceHost(envUrl: string | undefined, prodHost: string): string {
  if (!envUrl) return prodHost
  try {
    const h = new URL(envUrl).hostname
    return h === 'localhost' ? prodHost : h
  } catch {
    return prodHost
  }
}

/**
 * The canonical product-id constants. Use these instead of bare
 * strings (`PRODUCTS.menu`, not `'menu'`) so a rename surfaces as a
 * compile error everywhere.
 */
export const PRODUCTS = {
  menu: 'menu',
  tutor: 'tutor',
  house: 'house',
} as const

export type ProductId = (typeof PRODUCTS)[keyof typeof PRODUCTS]

export function productUrl(id: ProductId): string {
  switch (id) {
    case PRODUCTS.menu:
      return process.env.MENU_SURFACE_URL ?? `https://menu.${BRAND_DOMAIN}`
    case PRODUCTS.tutor:
      return process.env.TUTOR_SURFACE_URL ?? `https://tutor.${BRAND_DOMAIN}`
    case PRODUCTS.house:
      // House is the marketing surface at the apex domain — no subdomain.
      return process.env.HOUSE_SURFACE_URL ?? `https://${BRAND_DOMAIN}`
  }
}
