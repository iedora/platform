import { money } from "@iedora/billing";

import { getCharge } from "../../data/charges";
import type { BillingDeps } from "../../deps";
import type { RefundRequest, RefundResult } from "../../kinds";
import { insertRefund, type RefundRecord } from "./refunds.data";

// The refund slice. Everything explicit (project rule): the caller names the
// charge; the refund runs through the SAME kind the charge was settled with
// (charge.provider), never inferred. Manual is record-only (money moved back
// off-platform); stripe processes through the gateway. Partial vs full is the
// caller's explicit choice — an `amountCents` refunds that much, its absence
// refunds the full charge gross. Nothing is remapped or guessed.

/** A refund the service can't perform. The route maps `charge_not_found` to 404
 *  and everything else to 400. `reason` carries the specific message. */
export class RefundRejected extends Error {
  constructor(
    readonly code:
      | "charge_not_found" // no charge with that id (404)
      | "kind_unavailable" // the charge's kind is no longer configured (400)
      | "refund_not_supported" // the kind exists but has no refund capability (400)
      | "not_refundable" // the charge isn't in a refundable (paid) state (400)
      | "invalid_amount", // partial amount is non-positive or exceeds the charge gross (400)
    message: string,
  ) {
    super(message);
    this.name = "RefundRejected";
  }
}

export interface RefundChargeInput {
  /** The charge to refund (charges.id). */
  chargeId: string;
  /** Partial refund amount in minor units. Omit to refund the full charge gross. */
  amountCents?: number;
  reason?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export async function refundCharge(
  deps: BillingDeps,
  input: RefundChargeInput,
  clientId: string,
): Promise<RefundRecord> {
  const charge = await getCharge(deps.db.db, input.chargeId);
  if (!charge) throw new RefundRejected("charge_not_found", `charge not found: ${input.chargeId}`);

  // Only a settled (paid) charge can be refunded — refunding a pending/failed/
  // already-refunded charge is a contradictory-but-explicit request; reject it.
  if (charge.status !== "paid") {
    throw new RefundRejected("not_refundable", `charge ${charge.id} is not refundable (status: ${charge.status})`);
  }

  // Refund through the SAME kind that settled the charge — named on the record,
  // never inferred from what's present.
  const kind = deps.kinds[charge.provider];
  if (!kind) throw new RefundRejected("kind_unavailable", `payment kind not available: ${charge.provider}`);
  if (!kind.refund) {
    throw new RefundRejected("refund_not_supported", `payment kind '${charge.provider}' cannot refund`);
  }

  // Resolve the amount explicitly here so recording is deterministic (not reliant
  // on a provider echo): a partial amount is validated against the charge gross;
  // its absence is a full refund of the gross.
  const amount =
    input.amountCents == null
      ? money(charge.amountCents, charge.currency)
      : money(input.amountCents, charge.currency);
  if (amount.amount <= 0 || amount.amount > charge.amountCents) {
    throw new RefundRejected(
      "invalid_amount",
      `refund amount ${amount.amount} must be in (0, ${charge.amountCents}] for charge ${charge.id}`,
    );
  }

  const request: RefundRequest = {
    payment: charge.providerRef, // the provider payment id (null for manual)
    amount,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  };
  const result: RefundResult = await kind.refund(request);

  const record = await insertRefund(deps.db.db, {
    chargeId: charge.id,
    product: charge.product,
    amount: result.amount,
    status: result.status,
    provider: charge.provider,
    providerRef: result.providerRef,
    reason: input.reason ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    metadata: input.metadata ?? {},
  });

  await deps.auditor.record({
    action: "billing.charge.refunded",
    // A terminal success (manual 'refunded' / stripe 'succeeded') is a success;
    // an in-flight stripe refund ('pending') is not yet known.
    outcome: record.status === "refunded" || record.status === "succeeded" ? "success" : "unknown",
    actor: { type: "service", id: clientId },
    tenantId: charge.payer,
    targetType: "refund",
    targetId: record.id,
    meta: {
      charge_id: charge.id,
      kind: charge.provider,
      amount_cents: record.amountCents,
      status: record.status,
    },
  });

  return record;
}
