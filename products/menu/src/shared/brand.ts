/**
 * Single source of truth for brand + public URLs that appear in the UI.
 *
 * Static / safe in both server and client components (no `@/shared/env`
 * import) — for RUNTIME urls (CORS origin, auth callbacks) read
 * `env.MENU_PUBLIC_URL` from `@/shared/env` instead.
 *
 * To rebrand: change `BRAND_DOMAIN`. Everything else derives from it.
 * The full estate (iedora.com landing + menu.iedora.com app +
 * auth.iedora.com IdP + assets.iedora.com CDN) reconciles around it.
 */
export const BRAND_DOMAIN = 'iedora.com'

export const BRAND_NAME = 'iedora'
export const BRAND_URL = `https://${BRAND_DOMAIN}`
export const CONTACT_EMAIL = `hello@${BRAND_DOMAIN}`

// The Menu app lives on a `menu.` subdomain of the brand.
export const APP_HOSTNAME = `menu.${BRAND_DOMAIN}`
export const APP_URL = `https://${APP_HOSTNAME}`

// Sign-in / sign-out routes on the menu domain. The login route is a
// server-side handler that mints the OIDC state+PKCE cookies and 302s the
// browser to Zitadel's /authorize endpoint — see
// `src/app/api/auth/login/route.ts`.
export const SIGN_IN_PATH = '/api/auth/login'
export const SIGN_OUT_PATH = '/api/auth/logout'

/**
 * Helper for client + server callers: build a `/api/auth/login?next=…` URL
 * that the proxy + DAL redirect into when no session cookie is present.
 * `next` MUST be a same-origin path (the login handler re-validates).
 */
export function signInUrl(next?: string): string {
  if (!next) return SIGN_IN_PATH
  return `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`
}
