import type { AuthNextConfig } from "@iedora/auth-sdk-nextjs"
import { PRODUCTS, type ProductId, productUrl } from "@iedora/brand"

// Per-surface auth. Every surface authenticates against the same auth service but
// in its OWN tenant with its OWN cookie — a menu operator and a tutor student are
// separate user pools, so they never share a session. The one proxy middleware
// runs the right surface's refresh (via resolveRefresh) using its config here.
//
// One auth convention for all surfaces: @iedora/auth-sdk-nextjs + an AuthNextConfig.

// Each surface can target a DIFFERENT auth service — menu authenticates against
// the menu backend's auth role (AUTH_URL, tenant "auth", cookie iedora_access);
// tutor against the standalone iedora-auth (AUTH_BASE_URL, tenant "tutor", cookie
// tutor_access). They share nothing (separate user pools), so keep the base URLs
// per-surface rather than one shared value.
const MENU_AUTH = process.env.AUTH_URL ?? "http://localhost:4000"
const TUTOR_AUTH = process.env.AUTH_BASE_URL ?? process.env.AUTH_URL ?? "http://localhost:4000"

export type SurfaceAuth = {
  productId: ProductId
  config: AuthNextConfig
  /** Internal-path prefixes that require a session. */
  protectedPrefixes: string[]
}

export const SURFACE_AUTH: Record<string, SurfaceAuth> = {
  [PRODUCTS.menu]: {
    productId: PRODUCTS.menu,
    config: { baseUrl: MENU_AUTH, tenant: "auth", cookiePrefix: "iedora" },
    protectedPrefixes: ["/menu/dashboard", "/menu/onboarding"],
  },
  [PRODUCTS.tutor]: {
    productId: PRODUCTS.tutor,
    config: { baseUrl: TUTOR_AUTH, tenant: "tutor", cookiePrefix: "tutor" },
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
