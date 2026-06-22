import { adminCreateTenantRequest } from "@iedora/contracts";
import { type ServiceEnv, serviceAuth } from "@iedora/server-kit";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { findTenantWithOwner, listTenantsWithOwners } from "../../data/tenants";
import { findUserById } from "../../data/users";
import type { AuthDeps } from "../../deps";
import { metaFrom } from "../../session";
import { createTenantForUser } from "./tenants.service";

// Service-only tenant administration for the menu BFF (admin "New restaurant"):
//   GET  /auth/tenants/:id   — a tenant joined to its owner (names a restaurant's owner)
//   GET  /auth/admin/tenants — every owned tenant (the "assign to tenant" picker)
//   POST /auth/admin/tenants — provision a tenant owned by an existing user
// All gated by serviceAuth — the menu service presents a service token. Kept in
// the ServiceEnv slice so its types don't mix with the user-authed creation route.
export function tenantAdminRoutes(deps: AuthDeps) {
  return new Hono<ServiceEnv>()
    .get("/tenants/:id", serviceAuth(deps.serviceVerifier), async (c) => {
      const t = await findTenantWithOwner(deps.db.db, c.req.param("id"));
      if (!t) throw new HTTPException(404, { message: "tenant not found" });
      return c.json(t);
    })
    .get("/admin/tenants", serviceAuth(deps.serviceVerifier), async (c) => {
      return c.json({ tenants: await listTenantsWithOwners(deps.db.db) });
    })
    .post(
      "/admin/tenants",
      serviceAuth(deps.serviceVerifier),
      zValidator("json", adminCreateTenantRequest),
      async (c) => {
        const { name, ownerUserId } = c.req.valid("json");
        // The owner must be a real user — otherwise the membership insert would
        // 500 on a foreign-key violation. Surface a clean 422 instead.
        if (!(await findUserById(deps.db.db, ownerUserId))) {
          throw new HTTPException(422, { message: "owner user not found" });
        }
        return c.json(await createTenantForUser(deps, ownerUserId, name, metaFrom(c)));
      },
    );
}
