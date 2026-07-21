import { subscribeRequest } from "../../contracts";
import { type ServiceEnv, serviceAuth } from "@iedora/service-kit";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import type { BillingDeps } from "../../deps";
import { subscribe } from "./subscribe.service";

// Vertical slice: activating/changing a subscription. Owns its route, request
// validation (shared zod contract), and the service call. Mounted at /billing.
export function subscribeRoutes(deps: BillingDeps) {
  return new Hono<ServiceEnv>().post(
    "/subscribe",
    serviceAuth(deps.verifier),
    zValidator("json", subscribeRequest),
    async (c) => c.json(await subscribe(deps, c.req.valid("json"), c.get("clientId"))),
  );
}
