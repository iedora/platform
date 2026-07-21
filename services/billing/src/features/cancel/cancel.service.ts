import * as subscriptions from "../../data/subscriptions.ts";
import type { BillingDeps } from "../../deps.ts";
import { noSubscription } from "../../errors.ts";

// cancel ends a tenant's subscription for a product — the cancel + its audit
// event commit together. Throws when no active subscription matched.
export async function cancel(
  deps: BillingDeps,
  input: { tenantId: string; product: string },
  actorId: string,
): Promise<void> {
  await deps.db.runInTx(async () => {
    const ok = await subscriptions.cancel(deps.db.db, input.tenantId, input.product);
    if (!ok) throw noSubscription();
    await deps.auditor.recordSync({
      action: "billing.subscription.canceled",
      outcome: "success",
      actor: actorId ? { type: "user", id: actorId } : undefined,
      tenantId: input.tenantId,
      targetType: "subscription",
      targetId: input.product,
    });
  });
}
