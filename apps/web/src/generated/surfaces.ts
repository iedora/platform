// Host-to-surface topology consumed by src/proxy.ts and per-surface pages.
// Hand-maintained — adding a new surface here is rule #5 in apps/web/CLAUDE.md.
// (Previously emitted by `iedora emit-topology`, retired with the CI pipeline.)
//
// Consumed SERVER-SIDE only (the middleware + the root server page), so the host
// lists derive from this environment's runtime URL env vars (BRAND_URL,
// MENU_SURFACE_URL) — the same vars brandUrl()/productUrl() read. The router
// then matches this env's real hosts (prod menu.iedora.com, staging
// staging-menu.iedora.com) from one shared image. Unset -> prod hosts.

import { BRAND_DOMAIN, PRODUCTS, surfaceHost } from '@iedora/brand'

const brandHost = surfaceHost(process.env.BRAND_URL, BRAND_DOMAIN)
const menuHost = surfaceHost(process.env.MENU_SURFACE_URL, `menu.${BRAND_DOMAIN}`)
const tutorHost = surfaceHost(process.env.TUTOR_SURFACE_URL, `tutor.${BRAND_DOMAIN}`)
const vantageHost = surfaceHost(process.env.VANTAGE_SURFACE_URL, `vantage.${BRAND_DOMAIN}`)

export type Surface = {
  readonly name: string
  readonly hosts: ReadonlyArray<string>
  // URL prefix proxy.ts rewrites traffic under (e.g. "/menu").
  // Empty string means this surface owns the URL root (no rewrite).
  readonly rewritePath: string
  /**
   * Top-level URL segments the surface's slice code emits WITHOUT the
   * `rewritePath` prefix (e.g. the menu slice generates `/dashboard/...`,
   * not `/menu/dashboard/...`, because it expects to run under
   * `menu.<host>` where the host rewrite adds the prefix). Used by
   * proxy.ts to make those paths resolvable on plain `localhost`
   * (no subdomain) too. Each entry is matched as either an exact path
   * or a prefix with a trailing `/`.
   *
   * Keep aligned with the directories under `apps/web/src/app/<surface>/`.
   */
  readonly aliasPaths?: ReadonlyArray<string>
}

export const surfaces: ReadonlyArray<Surface> = [
  {
    name: "house",
    hosts: [brandHost, `www.${brandHost}`],
    rewritePath: "/house",
  },
  {
    name: PRODUCTS.menu,
    hosts: [menuHost, "menu.localhost"],
    rewritePath: "/menu",
    aliasPaths: [
      "/dashboard",
      "/onboarding",
      "/r",
      "/q",
      "/showcase",
      "/sign-out",
    ],
  },
  {
    name: PRODUCTS.tutor,
    hosts: [tutorHost, "tutor.localhost"],
    rewritePath: "/tutor",
    // Top-level segments the tutor pages emit (route groups add no path), so
    // they resolve on plain localhost too. Kept aligned with app/tutor/.
    aliasPaths: [
      "/chat",
      "/book",
      "/lessons",
      "/settings",
      "/account",
      "/admin",
      "/t",
      "/for-tutors",
      "/vs",
    ],
  },
  {
    name: "vantage",
    hosts: [vantageHost, "vantage.localhost"],
    rewritePath: "/vantage",
    // Top-level segments the vantage pages emit (route groups add no path), so
    // they resolve on plain localhost too. Kept aligned with app/vantage/.
    aliasPaths: [
      "/users",
      "/audit",
      "/emails",
    ],
  },
]

// surfaceByHost returns the surface whose host list contains `host`,
// or undefined. O(N) over a small list — no map needed.
export function surfaceByHost(host: string): Surface | undefined {
  return surfaces.find((s) => s.hosts.includes(host))
}
