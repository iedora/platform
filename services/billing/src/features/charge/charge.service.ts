import { money, splitByRate, zero } from "../../money";

import { type ChargeRecord, getCharge, insertCharge } from "../../data/charges";
import type { BillingDeps } from "../../deps";
import type { SettleInput } from "../../kinds";

// The one-off charge. Everything explicit: the caller names the `kind`; the kind
// validates its own request (stripe's `mode`) and rejects a bad combo. Manual
// records settled money that moved off-platform; stripe processes. The
// marketplace split (fee/net) is recorded here; the payout is a later step.

/** A kind the service isn't configured for, or a request the kind rejects. The
 *  route maps both to 400. `reason` is the kind's validation message when present. */
export class ChargeRejected extends Error {
  constructor(
    readonly code: "kind_unavailable" | "invalid_for_kind",
    message: string,
  ) {
    super(message);
    this.name = "ChargeRejected";
  }
}

export interface CreateChargeInput {
  product: string;
  payer: string;
  /** Marketplace payee. Omit for a platform-only charge. */
  payee?: string;
  amountCents: number;
  currency: string;
  /** REQUIRED — the settlement kind (no default). */
  kind: string;
  /** stripe: "charge" | "intent" (required for stripe; validated by the kind). */
  mode?: "charge" | "intent";
  /** Marketplace take-rate (0..1). With `payee`, splits gross → fee + payee net. */
  feeRate?: number;
  customer?: string;
  paymentMethod?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export type CreatedCharge = ChargeRecord & { clientSecret?: string };

export async function createCharge(
  deps: BillingDeps,
  input: CreateChargeInput,
  clientId: string,
): Promise<CreatedCharge> {
  const kind = deps.kinds[input.kind];
  if (!kind) throw new ChargeRejected("kind_unavailable", `payment kind not available: ${input.kind}`);

  const gross = money(input.amountCents, input.currency);
  const settleInput: SettleInput = {
    amount: gross,
    mode: input.mode,
    customer: input.customer,
    paymentMethod: input.paymentMethod,
    idempotencyKey: input.idempotencyKey,
  };

  const invalid = kind.validate(settleInput);
  if (invalid) throw new ChargeRejected("invalid_for_kind", invalid);

  // Marketplace charge splits gross into a platform fee + the payee's net;
  // a platform-only charge keeps the whole amount (net 0).
  const { fee, net } =
    input.payee != null && input.feeRate != null
      ? splitByRate(gross, input.feeRate)
      : { fee: gross, net: zero(input.currency) };

  const settled = await kind.settle(settleInput);

  const record = await insertCharge(deps.db.db, {
    product: input.product,
    payer: input.payer,
    payee: input.payee ?? null,
    gross,
    fee,
    net,
    status: settled.status,
    provider: input.kind,
    providerRef: settled.providerRef,
    idempotencyKey: input.idempotencyKey ?? null,
    metadata: input.metadata ?? {},
  });

  await deps.auditor.record({
    action: "billing.charge.created",
    outcome: settled.status === "paid" ? "success" : "unknown",
    actor: { type: "service", id: clientId },
    tenantId: input.payer,
    targetType: "charge",
    targetId: record.id,
    meta: {
      product: input.product,
      kind: input.kind,
      amount_cents: record.amountCents,
      fee_cents: record.feeCents,
      status: record.status,
    },
  });

  // clientSecret (stripe intent) is returned transiently, never stored.
  return settled.clientSecret ? { ...record, clientSecret: settled.clientSecret } : record;
}

export function fetchCharge(deps: BillingDeps, id: string): Promise<ChargeRecord | undefined> {
  return getCharge(deps.db.db, id);
}
