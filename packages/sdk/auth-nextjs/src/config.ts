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
  }
}

export const DEFAULT_ACCESS_MAX_AGE = 60 * 15
export const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 30
