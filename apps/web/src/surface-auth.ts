import type { AuthNextConfig } from "@iedora/auth-sdk-nextjs"
import { PRODUCTS, type ProductId, productUrl } from "@iedora/brand"

// Per-surface auth. Every surface authenticates against the same auth service but
// in its OWN tenant with its OWN cookie — a menu operator and a tutor student are
// separate user pools, so they never share a session. The one proxy middleware
// runs the right surface's refresh (via resolveRefresh) using its config here.
//
// One auth convention for all surfaces: @iedora/auth-sdk-nextjs + an AuthNextConfig.

const AUTH_BASE = process.env.AUTH_URL ?? process.env.AUTH_BASE_URL ?? "http://localhost:4000"

export type SurfaceAuth = {
  productId: ProductId
  config: AuthNextConfig
  /** Internal-path prefixes that require a session. */
  protectedPrefixes: string[]
}

export const SURFACE_AUTH: Record<string, SurfaceAuth> = {
  [PRODUCTS.menu]: {
    productId: PRODUCTS.menu,
    config: { baseUrl: AUTH_BASE, tenant: "auth", cookiePrefix: "iedora" },
    protectedPrefixes: ["/menu/dashboard", "/menu/onboarding"],
  },
  [PRODUCTS.tutor]: {
    productId: PRODUCTS.tutor,
    config: { baseUrl: AUTH_BASE, tenant: "tutor", cookiePrefix: "tutor" },
    protectedPrefixes: [
      "/tutor/chat",
      "/tutor/lessons",
      "/tutor/settings",
      "/tutor/account",
      "/tutor/admin",
      "/tutor/vantage",
    ],
  },
}

/** The surface that owns an internal path (`/menu/…` → menu), or undefined. */
export function surfaceAuthFor(internalPath: string): SurfaceAuth | undefined {
  for (const [name, sa] of Object.entries(SURFACE_AUTH)) {
    if (internalPath === `/${name}` || internalPath.startsWith(`/${name}/`)) return sa
  }
  return undefined
}

/** The surface's public sign-in URL with a `next` back to `returnTo`. */
export function surfaceSignInUrl(sa: SurfaceAuth, returnTo: string): string {
  const url = new URL(`${productUrl(sa.productId)}/sign-in`)
  url.searchParams.set("next", returnTo)
  return url.toString()
}
