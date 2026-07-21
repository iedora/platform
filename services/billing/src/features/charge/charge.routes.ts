import { PaymentError } from "../../money/index.ts";
import { type ServiceEnv, serviceAuth } from "@iedora/service-kit";
import { Hono } from "hono";
import { z } from "zod";

import type { BillingDeps } from "../../deps.ts";
import { ChargeRejected, createCharge, fetchCharge } from "./charge.service.ts";

// Vertical slice: the one-off charge. Everything explicit — `kind` is required,
// and `mode` (stripe) is validated by the kind. Body parsed in-handler to keep
// Hono's RPC type from exploding on the optional record field.
const chargeRequest = z.object({
  product: z.string().min(1),
  payer: z.string().min(1),
  payee: z.string().min(1).optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3),
  kind: z.string().min(1),
  mode: z.enum(["charge", "intent"]).optional(),
  feeRate: z.number().min(0).max(1).optional(),
  customer: z.string().optional(),
  paymentMethod: z.string().optional(),
  idempotencyKey: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function chargeRoutes(deps: BillingDeps) {
  return new Hono<ServiceEnv>()
    .post("/charges", serviceAuth(deps.verifier), async (c) => {
      const parsed = chargeRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
      try {
        return c.json(await createCharge(deps, parsed.data, c.get("clientId")));
      } catch (err) {
        if (err instanceof ChargeRejected) return c.json({ error: err.code, message: err.message }, 400);
        // A processor decline / SCA / provider error — a structured 402 with the
        // stable code so callers branch without sniffing messages.
        if (err instanceof PaymentError) return c.json({ error: err.code, message: err.message }, 402);
        throw err;
      }
    })
    .get("/charges/:id", serviceAuth(deps.verifier), async (c) => {
      const charge = await fetchCharge(deps, c.req.param("id"));
      return charge ? c.json(charge) : c.json({ error: "not_found" }, 404);
    });
}
