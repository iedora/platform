import type { Money } from "../../money/index.ts";
import { type Kysely, sql } from "kysely";
import type { BillingDB } from "../../schema.ts";

import { iso } from "../../data/dates.ts";
import type { RefundStatus } from "../../kinds.ts";

// Raw-SQL data access for the refunds ledger — the reverse leg of a charge. Same
// style as data/charges.ts: kept off kysely-codegen so the table doesn't require
// regenerating types; the row shape is explicit here. jsonb goes through sql.val
// (never JSON.stringify + ::jsonb — that double-encodes under Bun SQL).

export interface RefundRecord {
  id: string;
  chargeId: string;
  product: string;
  amountCents: number;
  currency: string;
  status: RefundStatus;
  provider: string;
  providerRef: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NewRefund {
  chargeId: string;
  product: string;
  amount: Money;
  status: RefundStatus;
  /** The kind that refunded (manual, stripe, ...). */
  provider: string;
  /** The provider's refund id; null for the manual kind. */
  providerRef: string | null;
  reason: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
}

interface Row {
  id: string;
  charge_id: string;
  product: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string;
  provider_ref: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

function toRecord(r: Row): RefundRecord {
  return {
    id: r.id,
    chargeId: r.charge_id,
    product: r.product,
    amountCents: r.amount_cents,
    currency: r.currency,
    status: r.status as RefundStatus,
    provider: r.provider,
    providerRef: r.provider_ref,
    reason: r.reason,
    metadata: r.metadata ?? {},
    createdAt: iso(r.created_at),
  };
}

const RETURNING = sql`RETURNING id, charge_id, product, amount_cents, currency, status,
  provider, provider_ref, reason, metadata, created_at`;

/** Insert a refund. On an idempotency-key clash returns the EXISTING row (so a
 *  retried request never double-refunds) rather than erroring — mirrors insertCharge. */
export async function insertRefund(db: Kysely<BillingDB>, r: NewRefund): Promise<RefundRecord> {
  const res = await sql<Row>`
    INSERT INTO refunds (charge_id, product, amount_cents, currency, status,
                         provider, provider_ref, reason, idempotency_key, metadata)
    VALUES (${r.chargeId}, ${r.product}, ${r.amount.amount}, ${r.amount.currency}, ${r.status},
            ${r.provider}, ${r.providerRef}, ${r.reason}, ${r.idempotencyKey}, ${sql.val(r.metadata)})
    ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
    ${RETURNING}
  `.execute(db);
  return toRecord(res.rows[0] as Row);
}

export async function getRefund(db: Kysely<BillingDB>, id: string): Promise<RefundRecord | undefined> {
  const res = await sql<Row>`
    SELECT id, charge_id, product, amount_cents, currency, status,
           provider, provider_ref, reason, metadata, created_at
    FROM refunds WHERE id = ${id}
  `.execute(db);
  const row = res.rows[0];
  return row ? toRecord(row as Row) : undefined;
}
