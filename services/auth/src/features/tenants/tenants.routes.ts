import { createTenantRequest } from "@iedora/contracts";
import { type UserEnv, userAuth } from "@iedora/service-runtime";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import type { AuthDeps } from "../../deps";
import { metaFrom } from "../../session";
import { createTenantForUser } from "./tenants.service";

export function tenantsRoutes(deps: AuthDeps) {
  return new Hono<UserEnv>().post(
    "/tenants",
    userAuth(deps.userVerifier),
    zValidator("json", createTenantRequest),
    async (c) => {
      const t = await createTenantForUser(deps, c.get("user").userId, c.req.valid("json").name, metaFrom(c));
      return c.json(t);
    },
  );
}
