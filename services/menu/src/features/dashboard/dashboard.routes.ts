import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { analytics, monthlyViews } from "../../data/analytics";
import { listRestaurantsWithCounts } from "../../data/restaurants.write";
import type { MenuDeps } from "../../deps";
import type { MenuEnv } from "../../middleware";
import { createRestaurant } from "../../service";

// Tenant-level dashboard slice: the caller's own restaurants, plan entitlements,
// and analytics. Mounted under /api (userAuth + requireTenant).
export function dashboardRoutes(deps: MenuDeps) {
  const db = () => deps.db.db;
  return new Hono<MenuEnv>()
    .get("/restaurants", async (c) =>
      c.json({ restaurants: await listRestaurantsWithCounts(db(), c.get("user").tenantId!) }),
    )
    .post(
      "/restaurants",
      zValidator("json", z.object({ name: z.string(), defaultLanguage: z.string().optional() })),
      async (c) => {
        const user = c.get("user");
        await deps.limiter.allow("onboarding", `user:${user.userId}`);
        const { name, defaultLanguage } = c.req.valid("json");
        const rest = await createRestaurant(deps, user.tenantId!, user.userId, name, defaultLanguage ?? "");
        return c.json(rest);
      },
    )
    .get("/plan", async (c) => c.json(await deps.plans.plan(c.get("user").tenantId!)))
    .get("/analytics", async (c) =>
      c.json(await analytics(db(), c.get("user").tenantId!, c.req.query("range") ?? "", new Date())),
    )
    .get("/views/month", async (c) =>
      c.json({ count: await monthlyViews(db(), c.get("user").tenantId!, new Date()) }),
    );
}
