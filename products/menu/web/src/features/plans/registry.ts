import type { PlanLimits } from '../../shared/api'

/**
 * DISPLAY-ONLY plan metadata for the billing page. The billing service
 * owns the actual entitlements (`GET /api/plan` returns the effective
 * `PlanLimits`) and enforces every gate server-side; this registry only
 * carries what the UI needs to render plan cards: labels live in i18n
 * (`Billing.plans.<code>.*`), feature bullet lists and the marketing
 * recommendation live here.
 *
 * Limits mirror the entitlements contract 1:1 (`-1` = unlimited) so the
 * cards can print capacity copy without an extra API call per plan.
 */

export type PlanCode = 'menu_free' | 'menu_pro' | 'menu_agency'

/** Discrete capabilities a plan card advertises / the UI gates on. */
export type PlanFeature = 'exportPdf' | 'customBranding' | 'analytics'

export type PlanDisplay = {
  readonly code: PlanCode
  // Display NAMES are not stored here — they live in i18n (`Billing.plans.<code>.name`),
  // the single source every surface (tenant billing page + admin) renders from.
  /** Monthly list price in minor units (cents); 0 = free. Drives the admin
   * payment dialog's automatic discount calculation. */
  readonly priceCents: number
  /** Mirrors the `PlanLimits` contract (-1 = unlimited). Display copy only. */
  readonly restaurants: number
  readonly monthlyViews: number
  readonly features: ReadonlyArray<PlanFeature>
  readonly isDefault: boolean
  readonly isRecommended?: boolean
}

export const REGISTRY = {
  menu_free: {
    code: 'menu_free',
    priceCents: 0,
    restaurants: 1,
    monthlyViews: 1000,
    features: [],
    isDefault: true,
  },
  menu_pro: {
    code: 'menu_pro',
    priceCents: 1200,
    restaurants: 3,
    monthlyViews: 20000,
    features: ['exportPdf', 'customBranding', 'analytics'],
    isDefault: false,
    isRecommended: true,
  },
  menu_agency: {
    code: 'menu_agency',
    priceCents: 4900,
    restaurants: -1,
    monthlyViews: -1,
    features: ['exportPdf', 'customBranding', 'analytics'],
    isDefault: false,
  },
} as const satisfies Record<PlanCode, PlanDisplay>

export const PLAN_CODES = Object.keys(REGISTRY) as PlanCode[]

export const PLANS: readonly PlanDisplay[] = Object.values(REGISTRY)

/**
 * Default ENTITLEMENTS for callers without a tenant (staff browsing the
 * dashboard chrome). Mirrors the billing service's default plan (menu_free).
 */
export const DEFAULT_PLAN: PlanLimits = {
  code: 'menu_free',
  restaurants: 1,
  monthlyViews: 1000,
  aiGenerationsWeek: 1,
}

export function isPlanCode(code: string): code is PlanCode {
  return code in REGISTRY
}

/** Display metadata for a raw code; unknown codes fall back to free. */
export function getPlanDisplay(code: string): PlanDisplay {
  return isPlanCode(code) ? REGISTRY[code] : REGISTRY.menu_free
}

/**
 * UI feature gate over the `PlanLimits` shape. Purely cosmetic
 * (hide a nav link, pre-disable a button) — the service is the
 * authority on what the token may actually do.
 */
export function planHas(plan: Pick<PlanLimits, 'code'>, feature: PlanFeature): boolean {
  return getPlanDisplay(plan.code).features.includes(feature)
}
