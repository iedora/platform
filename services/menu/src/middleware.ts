import { type UserPrincipal, hasRole } from "@iedora/server-kit";
import { createMiddleware } from "hono/factory";

import { restaurantBySlug } from "./data/restaurants";
import type { MenuDeps } from "./deps";
import type { Restaurant } from "./domain";
import { notFound } from "./errors";

// Staff role. A staff caller may reach any tenant's
// restaurant (the scoped check below) and the cross-tenant /staff surface.
export const STAFF_ROLE = "iedora-admin";

// MenuEnv carries the authenticated principal (set by server-kit userAuth) and,
// on scoped routes, the resolved restaurant.
export interface MenuEnv {
  Variables: { user: UserPrincipal; restaurant: Restaurant };
}

// requireTenant rejects a tenant-less token up front: every dashboard route reads
// the caller's tenant.
export const requireTenant = createMiddleware<MenuEnv>(async (c, next) => {
  if (!c.get("user").tenantId) return c.json({ error: "tenant required" }, 403);
  await next();
});

// requireRole gates a surface on the caller holding the given role.
// The cross-tenant /staff surface uses STAFF_ROLE.
export function requireRole(role: string) {
  return createMiddleware<MenuEnv>(async (c, next) => {
    if (!hasRole(c.get("user"), role)) return c.json({ error: "forbidden" }, 403);
    await next();
  });
}

// scoped resolves {slug} to a restaurant and enforces tenancy: the caller's
// tenant must own it, unless the caller is staff. Handlers read the loaded row
// via c.get("restaurant"). A foreign id and a missing
// id look identical (both 404).
export function scoped(deps: MenuDeps) {
  return createMiddleware<MenuEnv>(async (c, next) => {
    const rest = await restaurantBySlug(deps.db.db, c.req.param("slug") ?? "");
    if (!rest) throw notFound();
    const user = c.get("user");
    if (rest.tenantId !== user.tenantId && !hasRole(user, STAFF_ROLE)) throw notFound();
    c.set("restaurant", rest);
    await next();
  });
}
