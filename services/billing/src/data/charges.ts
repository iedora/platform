import type { Money, PaymentStatus } from "../money/index.ts";
import { type Kysely, sql } from "kysely";
import type { BillingDB } from "../schema.ts";

import { iso } from "./dates.ts";

// Raw-SQL data access for the generic charges ledger. Kept off kysely-codegen so
// a new table doesn't require regenerating types; the row shape is explicit here.

export interface ChargeRecord {
  id: string;
  product: string;
  payer: string;
  payee: string | null;
  amountCents: number;
  currency: string;
  feeCents: number;
  netCents: number;
  status: PaymentStatus;
  provider: string;
  providerRef: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NewCharge {
  product: string;
  payer: string;
  payee: string | null;
  gross: Money;
  fee: Money;
  net: Money;
  status: PaymentStatus;
  provider: string;
  providerRef: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
}

interface Row {
  id: string;
  product: string;
  payer: string;
  payee: string | null;
  amount_cents: number;
  currency: string;
  fee_cents: number;
  net_cents: number;
  status: string;
  provider: string;
  provider_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

function toRecord(r: Row): ChargeRecord {
  return {
    id: r.id,
    product: r.product,
    payer: r.payer,
    payee: r.payee,
    amountCents: r.amount_cents,
    currency: r.currency,
    feeCents: r.fee_cents,
    netCents: r.net_cents,
    status: r.status as PaymentStatus,
    provider: r.provider,
    providerRef: r.provider_ref,
    metadata: r.metadata ?? {},
    createdAt: iso(r.created_at),
  };
}

const RETURNING = sql`RETURNING id, product, payer, payee, amount_cents, currency, fee_cents,
  net_cents, status, provider, provider_ref, metadata, created_at`;

/** Insert a charge. On an idempotency-key clash returns the EXISTING row (so a
 *  retried request never double-charges) rather than erroring. */
export async function insertCharge(db: Kysely<BillingDB>, c: NewCharge): Promise<ChargeRecord> {
  // jsonb: pass the raw object via sql.val (the driver serializes it); never
  // JSON.stringify + ::jsonb (double-encodes under kysely-postgres-js/Bun SQL).
  const res = await sql<Row>`
    INSERT INTO charges (product, payer, payee, amount_cents, currency, fee_cents, net_cents,
                         status, provider, provider_ref, idempotency_key, metadata)
    VALUES (${c.product}, ${c.payer}, ${c.payee}, ${c.gross.amount}, ${c.gross.currency},
            ${c.fee.amount}, ${c.net.amount}, ${c.status}, ${c.provider}, ${c.providerRef},
            ${c.idempotencyKey}, ${sql.val(c.metadata)})
    ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
    ${RETURNING}
  `.execute(db);
  return toRecord(res.rows[0] as Row);
}

export async function getCharge(db: Kysely<BillingDB>, id: string): Promise<ChargeRecord | undefined> {
  const res = await sql<Row>`
    SELECT id, product, payer, payee, amount_cents, currency, fee_cents, net_cents,
           status, provider, provider_ref, metadata, created_at
    FROM charges WHERE id = ${id}
  `.execute(db);
  const row = res.rows[0];
  return row ? toRecord(row as Row) : undefined;
}
