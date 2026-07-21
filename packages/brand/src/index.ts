/**
 * Iedora brand constants + URL validators + cross-product URL registry.
 *
 * Brand-level — strings about the iedora brand itself (name, apex
 * domain, contact email), URL-shape validators that don't depend on
 * any particular product, AND the cross-product URL registry
 * (`productUrl(PRODUCTS.menu)`, ...) so callers don't need a workspace dep
 * on a sibling product just to learn where it lives.
 *
 * Per-product PATH BUILDERS still live inside each product
 * (`@iedora/product-menu/shared/auth-urls` exports `signInUrl`, etc.).
 * The split:
 *
 *   - brand           → "where is product X?"  (productUrl(id))
 *   - product-X/…     → "how do I build /foo on X?" (xFooUrl(...))
 *
 * Safe to import from server AND client. The URL helpers read PLAIN
 * (non-`NEXT_PUBLIC`) runtime env vars, which are NOT inlined at build, so the
 * SAME image serves any environment — set `BRAND_URL`/`MENU_SURFACE_URL` per
 * deployment. Server contexts (middleware, RSC, server actions) read the real
 * per-env value at request time; in the browser these vars are absent, so a
 * client call falls back to the prod apex (only cosmetic links call them client
 * side). Routing and auth — the parts that must be correct per env — are server-side.
 */

export const BRAND_DOMAIN = 'iedora.com'
export const BRAND_NAME = 'iedora'
export const CONTACT_EMAIL = `hello@${BRAND_DOMAIN}`

/**
 * Absolute URL for this environment's brand apex (house surface). Reads the
 * runtime `BRAND_URL` (prod `https://iedora.com`, staging
 * `https://staging.iedora.com`, dev `http://localhost:3000/house`); falls back
 * to the prod apex when unset (prod default, and the browser).
 */
export function brandUrl(): string {
  return process.env.BRAND_URL ?? `https://${BRAND_DOMAIN}`
}

export { PRODUCTS, productUrl, surfaceHost, type ProductId } from './products'

// ─── URL validators (no env, no I/O) ────────────────────────────────────

/**
 * Returns true iff `raw` parses as an absolute URL on the iedora apex
 * or any of its subdomains (`iedora.com`, `menu.iedora.com`,
 * `admin.iedora.com`, ...). `localhost` (any port) is also accepted so
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
