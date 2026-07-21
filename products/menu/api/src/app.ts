import { createServiceApp, healthRoutes, userAuth } from "@iedora/service-runtime";
import { Hono } from "hono";

import type { MenuDeps } from "./deps.ts";
import { handleError } from "./errors.ts";
import { builderRoutes } from "./features/builder/builder.routes.ts";
import { dashboardRoutes } from "./features/dashboard/dashboard.routes.ts";
import { publicRoutes } from "./features/public/public.routes.ts";
import { restaurantRoutes } from "./features/restaurant/restaurant.routes.ts";
import { staffRoutes } from "./features/staff/staff.routes.ts";
import { uploadsRoutes } from "./features/uploads/uploads.routes.ts";
import { type MenuEnv, requireTenant, scoped } from "./middleware.ts";

// Composition root: the unauthenticated /public surface + the authenticated /api
// dashboard surface (the cross-tenant /staff surface + uploads land in Stage C).
// onError is the menu handler so a malformed-uuid path param surfaces as 404.
export function buildApp(deps: MenuDeps) {
  // Scoped subtree: everything under /restaurants/{slug}. The scoped middleware
  // resolves the restaurant + enforces tenancy once for the whole subtree.
  const scopedApp = new Hono<MenuEnv>()
    .use(scoped(deps))
    .route("/", restaurantRoutes(deps))
    .route("/", builderRoutes(deps))
    .route("/", uploadsRoutes(deps));

  // The dashboard surface reads the CALLER's tenant, so it stays under
  // requireTenant. The scoped restaurant subtree does NOT: its own `scoped`
  // middleware enforces tenancy (owner same-tenant, or staff cross-tenant) and
  // its handlers key off the resolved restaurant's tenant, never the caller's —
  // so a tenant-less staff token can edit any restaurant top to bottom.
  const tenantApp = new Hono<MenuEnv>()
    .use(requireTenant)
    .route("/", dashboardRoutes(deps));

  const api = new Hono<MenuEnv>()
    .use(userAuth(deps.userVerifier))
    .route("/staff", staffRoutes(deps))
    .route("/restaurants/:slug", scopedApp)
    .route("/", tenantApp);

  const app = createServiceApp<MenuEnv>()
    .route("/", healthRoutes(() => deps.db.ping()))
    .route("/public", publicRoutes(deps))
    .route("/api", api);

  app.onError(handleError);
  return app;
}

export type MenuApp = ReturnType<typeof buildApp>;
