import { money } from "../../money";

import { getPayout, insertPayout, type PayoutRecord } from "../../data/payouts";
import type { BillingDeps } from "../../deps";

// The payout — money OWED to a marketplace payee. Per design this slice only
// RECORDS the payout (status 'pending'); EXECUTION (the actual transfer) is a
// LATER step, so NO `kind` is named and NO money moves here. Everything explicit
// (project rule): the caller names payee + amountCents + currency directly; a
// contradictory-but-explicit combo is rejected rather than reinterpreted.

/** A payout request the service rejects. The route maps this to 400. */
export class PayoutRejected extends Error {
  constructor(
    readonly code: "invalid_request",
    message: string,
  ) {
    super(message);
    this.name = "PayoutRejected";
  }
}

export interface CreatePayoutInput {
  /** Marketplace payee to be paid. REQUIRED. */
  payee: string;
  amountCents: number;
  currency: string;
  /** Which product this payout is for (menu, tutor, ...). Optional. */
  product?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export async function createPayout(
  deps: BillingDeps,
  input: CreatePayoutInput,
  clientId: string,
): Promise<PayoutRecord> {
  // A payout must move a positive amount to a payee. money() also rejects a
  // malformed currency; the positive-amount check is explicit here.
  if (input.amountCents <= 0) {
    throw new PayoutRejected("invalid_request", "amountCents must be a positive integer minor-unit amount");
  }
  const amount = money(input.amountCents, input.currency);

  // Recording only: status is always 'pending' and there is no provider/ref yet.
  // Execution is a separate later step that will settle this row.
  const record = await insertPayout(deps.db.db, {
    product: input.product ?? null,
    payee: input.payee,
    amount,
    status: "pending",
    provider: null,
    providerRef: null,
    idempotencyKey: input.idempotencyKey ?? null,
    metadata: input.metadata ?? {},
  });

  await deps.auditor.record({
    action: "billing.payout.created",
    outcome: "success",
    actor: { type: "service", id: clientId },
    tenantId: input.payee,
    targetType: "payout",
    targetId: record.id,
    meta: {
      product: input.product ?? null,
      payee: record.payee,
      amount_cents: record.amountCents,
      currency: record.currency,
      status: record.status,
    },
  });

  return record;
}

export function fetchPayout(deps: BillingDeps, id: string): Promise<PayoutRecord | undefined> {
  return getPayout(deps.db.db, id);
}
