import { cancelRequest } from "../../contracts";
import { type ServiceEnv, serviceAuth } from "@iedora/service-kit";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import type { BillingDeps } from "../../deps";
import { cancel } from "./cancel.service";

// Vertical slice: canceling a subscription. Returns a small JSON body for a
// typed RPC result. Mounted at /billing.
export function cancelRoutes(deps: BillingDeps) {
  return new Hono<ServiceEnv>().post(
    "/cancel",
    serviceAuth(deps.verifier),
    zValidator("json", cancelRequest),
    async (c) => {
      await cancel(deps, c.req.valid("json"), c.get("clientId"));
      return c.json({ ok: true });
    },
  );
}
