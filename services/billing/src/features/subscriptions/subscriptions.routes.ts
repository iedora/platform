import { type ServiceEnv, serviceAuth } from "@iedora/server-kit";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import * as subscriptions from "../../data/subscriptions";
import type { BillingDeps } from "../../deps";

// Vertical slice: listing a tenant's subscriptions. `tenant` is required (400 on
// missing). Read-only — no transaction. Mounted at /billing.
export function subscriptionsRoutes(deps: BillingDeps) {
  return new Hono<ServiceEnv>().get(
    "/subscriptions",
    serviceAuth(deps.verifier),
    zValidator("query", z.object({ tenant: z.string().min(1) })),
    async (c) =>
      c.json({ subscriptions: await subscriptions.listByTenant(deps.db.db, c.req.valid("query").tenant) }),
  );
}
