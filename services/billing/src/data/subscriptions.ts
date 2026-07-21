import type { Subscription } from "../contracts";
import { type Kysely, type Selectable, sql } from "kysely";

import type { Subscriptions } from "../db.generated";
import type { BillingDB } from "../schema";
import { iso, isoOpt } from "./dates";

const COLUMNS = [
  "id",
  "tenant_id",
  "product",
  "plan_code",
  "status",
  "current_period_end",
  "canceled_at",
  "created_at",
  "updated_at",
] as const;

function toSubscription(r: Pick<Selectable<Subscriptions>, (typeof COLUMNS)[number]>): Subscription {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    product: r.product,
    planCode: r.plan_code,
    status: r.status,
    currentPeriodEnd: isoOpt(r.current_period_end),
    canceledAt: isoOpt(r.canceled_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export interface UpsertSubscription {
  tenantId: string;
  product: string;
  planCode: string;
  currentPeriodEnd: Date;
}

// upsert creates or replaces the (tenant, product) subscription, reactivating a
// previously canceled one (status→active, canceled_at→NULL).
export async function upsert(db: Kysely<BillingDB>, s: UpsertSubscription): Promise<Subscription> {
  const row = await db
    .insertInto("subscriptions")
    .values({
      tenant_id: s.tenantId,
      product: s.product,
      plan_code: s.planCode,
      status: "active",
      current_period_end: s.currentPeriodEnd,
    })
    .onConflict((oc) =>
      oc.columns(["tenant_id", "product"]).doUpdateSet({
        plan_code: (eb) => eb.ref("excluded.plan_code"),
        status: "active",
        current_period_end: (eb) => eb.ref("excluded.current_period_end"),
        canceled_at: null,
        updated_at: sql`now()`,
      }),
    )
    .returning([...COLUMNS])
    .executeTakeFirstOrThrow();
  return toSubscription(row);
}

// cancel marks the tenant's active subscription for a product canceled. Returns
// false when none was active (the caller turns that into 404).
export async function cancel(
  db: Kysely<BillingDB>,
  tenantId: string,
  product: string,
): Promise<boolean> {
  const res = await db
    .updateTable("subscriptions")
    .set({ status: "canceled", canceled_at: sql`now()`, updated_at: sql`now()` })
    .where("tenant_id", "=", tenantId)
    .where("product", "=", product)
    .where("status", "<>", "canceled")
    .executeTakeFirst();
  return (res.numUpdatedRows ?? 0n) > 0n;
}

// listByTenant returns the tenant's subscriptions ordered by product.
export async function listByTenant(
  db: Kysely<BillingDB>,
  tenantId: string,
): Promise<Subscription[]> {
  const rows = await db
    .selectFrom("subscriptions")
    .select([...COLUMNS])
    .where("tenant_id", "=", tenantId)
    .orderBy("product")
    .execute();
  return rows.map(toSubscription);
}
