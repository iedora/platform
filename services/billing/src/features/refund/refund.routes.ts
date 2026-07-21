import { type ServiceEnv, serviceAuth } from "@iedora/service-kit";
import { Hono } from "hono";
import { z } from "zod";

import type { BillingDeps } from "../../deps";
import { RefundRejected, refundCharge } from "./refund.service";

// Vertical slice: refund a charge. POST /billing/charges/:id/refund. Everything
// explicit — the kind is taken from the original charge, `amountCents` (partial)
// is optional. Body parsed in-handler (not zValidator) to keep Hono's RPC type
// from exploding on the optional record field, mirroring the charge slice.
const refundRequest = z.object({
  amountCents: z.number().int().positive().optional(),
  reason: z.string().min(1).optional(),
  idempotencyKey: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function refundRoutes(deps: BillingDeps) {
  return new Hono<ServiceEnv>().post("/charges/:id/refund", serviceAuth(deps.verifier), async (c) => {
    // All fields are optional: an absent/empty body is a valid full refund, so
    // fall back to {} (not null) when there's no JSON to parse.
    const parsed = refundRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    try {
      const refund = await refundCharge(deps, { chargeId: c.req.param("id"), ...parsed.data }, c.get("clientId"));
      return c.json(refund);
    } catch (err) {
      if (err instanceof RefundRejected) {
        return c.json({ error: err.code, message: err.message }, err.code === "charge_not_found" ? 404 : 400);
      }
      throw err;
    }
  });
}
