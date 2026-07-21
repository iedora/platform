import type { Subscription } from "../../contracts.ts";

import * as invoices from "../../data/invoices.ts";
import * as subscriptions from "../../data/subscriptions.ts";
import type { BillingDeps } from "../../deps.ts";
import { unknownPlan } from "../../errors.ts";
import { getPlan } from "../../plans.ts";

// subscribe activates (or changes) a tenant's plan and issues an invoice for
// paid plans — subscription upsert + invoice + audit all commit together (so an
// event is durable exactly when the change lands).
export async function subscribe(
  deps: BillingDeps,
  input: { tenantId: string; planCode: string },
  actorId: string,
): Promise<Subscription> {
  const plan = getPlan(input.planCode);
  if (!plan) throw unknownPlan();

  const currentPeriodEnd = new Date(Date.now() + deps.cfg.periodMs);

  return deps.db.runInTx(async () => {
    const sub = await subscriptions.upsert(deps.db.db, {
      tenantId: input.tenantId,
      product: plan.product,
      planCode: plan.code,
      currentPeriodEnd,
    });
    if (plan.priceCents > 0) {
      await invoices.insert(deps.db.db, {
        tenantId: input.tenantId,
        product: plan.product,
        planCode: plan.code,
        amountCents: plan.priceCents,
        currency: plan.currency,
      });
    }
    await deps.auditor.recordSync({
      action: "billing.subscription.created",
      outcome: "success",
      actor: actorId ? { type: "user", id: actorId } : undefined,
      tenantId: input.tenantId,
      targetType: "subscription",
      targetId: plan.product,
      meta: { plan: plan.code, amount_cents: plan.priceCents },
    });
    return sub;
  });
}
