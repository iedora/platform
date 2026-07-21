import { PaymentError } from "../../money/index.ts";
import { type ServiceEnv, serviceAuth } from "@iedora/service-kit";
import { Hono } from "hono";
import { z } from "zod";

import type { BillingDeps } from "../../deps.ts";
import { createSetup, getPaymentMethod, SetupRejected } from "./setup.service.ts";

// Vertical slice: "save a card". POST /billing/payment-methods/setup starts a
// Stripe SetupIntent; the returned clientSecret is confirmed on the client to
// attach the method. Everything explicit — `kind` is required and must be
// "stripe" (the only kind that supports setup). Body parsed in-handler (not
// zValidator) to keep Hono's RPC type intact on the optional record field.
const setupRequest = z.object({
  kind: z.string().min(1),
  customer: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export function setupRoutes(deps: BillingDeps) {
  return new Hono<ServiceEnv>()
    .post("/payment-methods/setup", serviceAuth(deps.verifier), async (c) => {
      const parsed = setupRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
      try {
        return c.json(await createSetup(deps, parsed.data, c.get("clientId")));
      } catch (err) {
        if (err instanceof SetupRejected) return c.json({ error: err.code, message: err.message }, 400);
        throw err;
      }
    })
    // GET /billing/payment-methods/:id — a saved method's displayable bits.
    .get("/payment-methods/:id", serviceAuth(deps.verifier), async (c) => {
      try {
        return c.json(await getPaymentMethod(deps, c.req.param("id")));
      } catch (err) {
        if (err instanceof SetupRejected) return c.json({ error: err.code, message: err.message }, 400);
        if (err instanceof PaymentError) return c.json({ error: err.code, message: err.message }, 402);
        throw err;
      }
    });
}
