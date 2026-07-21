import type { Invoice } from "../contracts.ts";
import type { Kysely, Selectable } from "kysely";

import type { Invoices } from "../db.generated.ts";
import type { BillingDB } from "../schema.ts";
import { iso } from "./dates.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const COLUMNS = [
  "id",
  "tenant_id",
  "product",
  "plan_code",
  "amount_cents",
  "currency",
  "status",
  "promo",
  "created_at",
] as const;

function toInvoice(r: Pick<Selectable<Invoices>, (typeof COLUMNS)[number]>): Invoice {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    product: r.product,
    planCode: r.plan_code,
    amountCents: Number(r.amount_cents), // bigint arrives as string; the values fit a JS number
    currency: r.currency,
    status: r.status,
    promo: r.promo ?? null,
    createdAt: iso(r.created_at),
  };
}

export interface NewInvoice {
  tenantId: string;
  product: string;
  planCode: string;
  amountCents: number;
  currency: string;
  /** Optional status override (e.g. 'paid' for a manually-recorded cash
   * payment). Omitted ⇒ the schema default ('issued'). */
  status?: string;
  /** Optional promo / campaign label. */
  promo?: string;
}

// insert persists an invoice (status defaults to 'issued' in the schema unless
// overridden — staff record cash payments as 'paid').
export async function insert(db: Kysely<BillingDB>, i: NewInvoice): Promise<Invoice> {
  const row = await db
    .insertInto("invoices")
    .values({
      tenant_id: i.tenantId,
      product: i.product,
      plan_code: i.planCode,
      amount_cents: i.amountCents,
      currency: i.currency,
      ...(i.status ? { status: i.status } : {}),
      ...(i.promo ? { promo: i.promo } : {}),
    })
    .returning([...COLUMNS])
    .executeTakeFirstOrThrow();
  return toInvoice(row);
}

// listByTenant returns the tenant's invoices, newest first, capped at 200.
export async function listByTenant(db: Kysely<BillingDB>, tenantId: string): Promise<Invoice[]> {
  const rows = await db
    .selectFrom("invoices")
    .select([...COLUMNS])
    .where("tenant_id", "=", tenantId)
    .orderBy("created_at", "desc")
    .limit(MAX_LIMIT)
    .execute();
  return rows.map(toInvoice);
}

// listRecent returns the most recent invoices across all tenants, newest first;
// limit is clamped to 50 when out of the (0, 200] range.
export async function listRecent(db: Kysely<BillingDB>, limit: number): Promise<Invoice[]> {
  const n = limit > 0 && limit <= MAX_LIMIT ? limit : DEFAULT_LIMIT;
  const rows = await db
    .selectFrom("invoices")
    .select([...COLUMNS])
    .orderBy("created_at", "desc")
    .limit(n)
    .execute();
  return rows.map(toInvoice);
}
