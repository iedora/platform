import { type ServiceEnv, serviceAuth } from "@iedora/service-kit";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import * as invoices from "../../data/invoices";
import * as subscriptions from "../../data/subscriptions";
import type { BillingDeps } from "../../deps";

// A recorded payment activates the plan for a full year (the chosen paid period).
const PAID_PERIOD_MS = 365 * 24 * 60 * 60 * 1000;

// Vertical slice: the invoice ledger. With `tenant` → that tenant's invoices;
// without → the recent cross-tenant feed (admin), `limit` clamped server-side.
// Read-only. Mounted at /billing.
export function invoicesRoutes(deps: BillingDeps) {
  return new Hono<ServiceEnv>()
    .get(
      "/invoices",
      serviceAuth(deps.verifier),
      zValidator(
        "query",
        z.object({
          tenant: z.string().optional(),
          limit: z.coerce.number().int().positive().optional(),
        }),
      ),
      async (c) => {
        const { tenant, limit } = c.req.valid("query");
        const rows = tenant
          ? await invoices.listByTenant(deps.db.db, tenant)
          : await invoices.listRecent(deps.db.db, limit ?? 0);
        return c.json({ invoices: rows });
      },
    )
    // Record a payment — a manually-entered invoice (cash-first). Service-to-
    // service only (the menu admin BFF calls it on a staff action). Status
    // defaults to 'paid' since this records money already received.
    .post(
      "/invoices",
      serviceAuth(deps.verifier),
      zValidator(
        "json",
        z.object({
          tenant: z.string().min(1),
          product: z.string().min(1).default("menu"),
          planCode: z.string().min(1),
          amountCents: z.number().int().positive(),
          currency: z.string().min(1).default("EUR"),
          status: z.string().min(1).default("paid"),
          promo: z.string().min(1).max(80).optional(),
          actorId: z.string().min(1).optional(),
        }),
      ),
      async (c) => {
        const b = c.req.valid("json");
        // A payment both records the invoice AND upgrades the tenant: the
        // subscription is activated/extended to the paid plan for a year, and a
        // single audit event captures the payment + the triggered upgrade. All
        // in one tx so the ledger, the plan, and the event land together.
        const currentPeriodEnd = new Date(Date.now() + PAID_PERIOD_MS);
        const invoice = await deps.db.runInTx(async () => {
          const inv = await invoices.insert(deps.db.db, {
            tenantId: b.tenant,
            product: b.product,
            planCode: b.planCode,
            amountCents: b.amountCents,
            currency: b.currency,
            status: b.status,
            promo: b.promo,
          });
          await subscriptions.upsert(deps.db.db, {
            tenantId: b.tenant,
            product: b.product,
            planCode: b.planCode,
            currentPeriodEnd,
          });
          await deps.auditor.recordSync({
            action: "billing.payment.recorded",
            outcome: "success",
            actor: b.actorId ? { type: "user", id: b.actorId } : { type: "service", id: "menu" },
            tenantId: b.tenant,
            targetType: "subscription",
            targetId: b.product,
            meta: {
              plan: b.planCode,
              amount_cents: b.amountCents,
              currency: b.currency,
              promo: b.promo ?? null,
              upgraded_to: b.planCode,
              current_period_end: currentPeriodEnd.toISOString(),
            },
          });
          return inv;
        });
        return c.json({ invoice }, 201);
      },
    );
}
