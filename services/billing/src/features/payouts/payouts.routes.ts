import { type ServiceEnv, serviceAuth } from "@iedora/menu-kit";
import { Hono } from "hono";
import { z } from "zod";

import type { BillingDeps } from "../../deps";
import { createPayout, fetchPayout, PayoutRejected } from "./payouts.service";

// Vertical slice: the payout. Everything explicit — payee + amountCents +
// currency are required; NO `kind` (this only RECORDS the payout, execution is a
// later step). Body parsed in-handler to keep Hono's RPC type from exploding.
const payoutRequest = z.object({
  payee: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3),
  product: z.string().min(1).optional(),
  idempotencyKey: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function payoutsRoutes(deps: BillingDeps) {
  return new Hono<ServiceEnv>()
    .post("/payouts", serviceAuth(deps.verifier), async (c) => {
      const parsed = payoutRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
      try {
        return c.json(await createPayout(deps, parsed.data, c.get("clientId")));
      } catch (err) {
        if (err instanceof PayoutRejected) return c.json({ error: err.code, message: err.message }, 400);
        throw err;
      }
    })
    .get("/payouts/:id", serviceAuth(deps.verifier), async (c) => {
      const payout = await fetchPayout(deps, c.req.param("id"));
      return payout ? c.json(payout) : c.json({ error: "not_found" }, 404);
    });
}
