import type { Database } from "@iedora/server-kit";

import type { PlanSource } from "./billing";
import { countRestaurants } from "./data/restaurants.write";
import { invalid } from "./errors";
import type { MenuDB } from "./schema";

// Plan entitlements. The DB stores raw billing
// codes; this registry interprets them, so renaming plans never breaks gates.
// Lookups fail open to the default plan: billing being down must not block menu
// edits, only cap them at free-tier limits.

export interface PlanLimits {
  code: string;
  restaurants: number; // -1 = unlimited
  monthlyViews: number; // soft nudge, not enforced server-side
  aiGenerationsWeek: number; // rolling 7-day window
}

export const PlanRegistry: Record<string, PlanLimits> = {
  menu_free: { code: "menu_free", restaurants: 1, monthlyViews: 1000, aiGenerationsWeek: 1 },
  menu_pro: { code: "menu_pro", restaurants: 3, monthlyViews: 20000, aiGenerationsWeek: 10 },
  menu_agency: { code: "menu_agency", restaurants: -1, monthlyViews: -1, aiGenerationsWeek: 50 },
};

export const DefaultPlan = PlanRegistry.menu_free!;

export class Plans {
  constructor(
    private readonly source: PlanSource,
    private readonly db: Database<MenuDB>,
  ) {}

  // plan resolves the tenant's effective entitlements (fail-open to default).
  async plan(tenantId: string): Promise<PlanLimits> {
    let code: string;
    try {
      code = await this.source.planCode(tenantId);
    } catch {
      return DefaultPlan;
    }
    return PlanRegistry[code] ?? DefaultPlan;
  }

  // canAddRestaurant throws a 422 when the tenant's plan limit is reached.
  async canAddRestaurant(tenantId: string): Promise<void> {
    const plan = await this.plan(tenantId);
    if (plan.restaurants < 0) return;
    const n = await countRestaurants(this.db.db, tenantId);
    if (n >= plan.restaurants) {
      throw invalid(`plan limit reached (${plan.restaurants} restaurants); upgrade to add more`);
    }
  }
}
