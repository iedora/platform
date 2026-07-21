/** Wiring for a product's integration with the auth service. */
export type AuthNextConfig = {
  /** Auth service base URL (also the JWT issuer), e.g. https://auth.example.com. */
  baseUrl: string
  /** This product's tenant slug in the auth service. */
  tenant: string
  /** Expected token audience (omit to skip the aud check). */
  audience?: string
  /** Cookie name prefix (default "auth"): `<prefix>_access` / `<prefix>_refresh`. */
  cookiePrefix?: string
  /** Cookie `Domain`. Set to a shared parent (e.g. `.iedora.com`) so every product
   *  subdomain reads the same session — the basis of cross-product SSO. Omit for a
   *  host-only cookie (single-surface). */
  cookieDomain?: string
  /** Access-cookie lifetime (s). Default 900 (matches the access-token TTL). */
  accessMaxAge?: number
  /** Refresh-cookie lifetime (s). Default 30d. */
  refreshMaxAge?: number
  /** Force `Secure` cookies (default: on in production). */
  secure?: boolean
}

export function cookieNames(prefix = "auth"): { access: string; refresh: string } {
  return { access: `${prefix}_access`, refresh: `${prefix}_refresh` }
}

export function cookieOptions(config: AuthNextConfig) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.secure ?? process.env.NODE_ENV === "production",
    path: "/",
    // Shared parent domain → SSO across subdomains; omitted = host-only.
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  }
}

export const DEFAULT_ACCESS_MAX_AGE = 60 * 15
export const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 30

// THE one auth realm for every product (menu, tutor, house): tenant "iedora",
// audience "iedora". AUTH_COOKIE_DOMAIN (".iedora.com" in prod) puts the session
// cookie on the shared parent domain so one sign-in is SSO everywhere. This is
// pure config (no next/headers), so it's safe to import from the edge middleware.
export const authConfig: AuthNextConfig = {
  baseUrl: process.env.AUTH_BASE_URL ?? "http://localhost:4000",
  tenant: process.env.AUTH_TENANT ?? "iedora",
  audience: process.env.AUTH_AUDIENCE ?? "iedora",
  cookiePrefix: "iedora",
  cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
}
