import type { Auditor, Database } from "@iedora/server-kit";
import { sql } from "kysely";

import type { BillingDB } from "../../schema";

/**
 * Sweeps active subscriptions whose period has ended: flips them to `expired`
 * (so `planCode` resolves to On Us / free) and emits a tenant-targeted audit
 * event per downgrade. Run on a schedule from the service entrypoint.
 *
 * The `WHERE status = 'active'` guard makes it idempotent and multi-instance
 * safe — a second concurrent sweep finds the rows already expired and re-emits
 * nothing. Returns how many subscriptions were expired.
 */
export async function expireDueSubscriptions(
  db: Database<BillingDB>,
  auditor: Auditor,
): Promise<number> {
  return db.runInTx(async () => {
    const expired = await db.db
      .updateTable("subscriptions")
      .set({ status: "expired", updated_at: sql`now()` })
      .where("status", "=", "active")
      .where("current_period_end", "<=", sql<Date>`now()`)
      .returning(["tenant_id", "product", "plan_code"])
      .execute();

    for (const s of expired) {
      await auditor.recordSync({
        action: "billing.subscription.expired",
        outcome: "success",
        // No actor → the envelope records actorType "system" (a scheduled sweep).
        tenantId: s.tenant_id,
        targetType: "subscription",
        targetId: s.product,
        meta: { plan: s.plan_code, downgraded_to: "on_us" },
      });
    }
    return expired.length;
  });
}
