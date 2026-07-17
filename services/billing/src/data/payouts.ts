import type { Money } from "@iedora/billing";
import { type Kysely, sql } from "kysely";

import { iso } from "./dates";

// Raw-SQL data access for the payouts ledger. Kept off kysely-codegen so a new
// table doesn't require regenerating types; the row shape is explicit here.
// A payout RECORDS money owed to a payee; execution (the actual transfer) is a
// LATER step, so a fresh row is always status 'pending' with no provider ref.

export interface PayoutRecord {
  id: string;
  product: string | null;
  payee: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string | null;
  providerRef: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NewPayout {
  product: string | null;
  payee: string;
  amount: Money;
  status: string;
  provider: string | null;
  providerRef: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
}

interface Row {
  id: string;
  product: string | null;
  payee: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string | null;
  provider_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

function toRecord(r: Row): PayoutRecord {
  return {
    id: r.id,
    product: r.product,
    payee: r.payee,
    amountCents: r.amount_cents,
    currency: r.currency,
    status: r.status,
    provider: r.provider,
    providerRef: r.provider_ref,
    metadata: r.metadata ?? {},
    createdAt: iso(r.created_at),
  };
}

const RETURNING = sql`RETURNING id, product, payee, amount_cents, currency, status,
  provider, provider_ref, metadata, created_at`;

/** Insert a payout. On an idempotency-key clash returns the EXISTING row (so a
 *  retried request never double-records a payout) rather than erroring. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertPayout(db: Kysely<any>, p: NewPayout): Promise<PayoutRecord> {
  // jsonb: pass the raw object via sql.val (the driver serializes it); never
  // JSON.stringify + ::jsonb (double-encodes under kysely-postgres-js/Bun SQL).
  const res = await sql<Row>`
    INSERT INTO payouts (product, payee, amount_cents, currency, status,
                         provider, provider_ref, idempotency_key, metadata)
    VALUES (${p.product}, ${p.payee}, ${p.amount.amount}, ${p.amount.currency}, ${p.status},
            ${p.provider}, ${p.providerRef}, ${p.idempotencyKey}, ${sql.val(p.metadata)})
    ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
    ${RETURNING}
  `.execute(db);
  return toRecord(res.rows[0] as Row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPayout(db: Kysely<any>, id: string): Promise<PayoutRecord | undefined> {
  const res = await sql<Row>`
    SELECT id, product, payee, amount_cents, currency, status,
           provider, provider_ref, metadata, created_at
    FROM payouts WHERE id = ${id}
  `.execute(db);
  const row = res.rows[0];
  return row ? toRecord(row as Row) : undefined;
}
