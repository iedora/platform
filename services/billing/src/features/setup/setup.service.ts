import type { Setup } from "../../money";

import type { BillingDeps } from "../../deps";
import type { SavedCardInfo } from "../../kinds";

// The "save a card" slice — begin a Stripe SetupIntent the client confirms to
// attach a payment method for later off-session charges. Everything explicit:
// the caller names `kind` and it MUST be "stripe" (the only kind that supports
// setup). We do not infer the kind, and we do not silently fall back — an
// unconfigured stripe or any other named kind is rejected.

/** The named kind can't do a setup: it isn't "stripe", stripe isn't configured,
 *  or the resolved kind doesn't expose the setup capability. The route maps this
 *  to 400 (mirrors ChargeRejected's kind_unavailable). */
export class SetupRejected extends Error {
  constructor(
    readonly code: "kind_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "SetupRejected";
  }
}

export interface CreateSetupInput {
  /** REQUIRED — the settlement kind (no default). Must be "stripe": only the
   *  stripe kind supports saving a payment method. */
  kind: string;
  /** Existing provider customer to attach the method to; omit to create one. */
  customer?: string;
  metadata?: Record<string, string>;
}

export async function createSetup(
  deps: BillingDeps,
  input: CreateSetupInput,
  clientId: string,
): Promise<Setup> {
  // Explicit contract: only "stripe" can do setup. Reject any other named kind
  // up front rather than reinterpreting it.
  if (input.kind !== "stripe") {
    throw new SetupRejected("kind_unavailable", `setup is only supported by the stripe kind, not: ${input.kind}`);
  }

  const kind = deps.kinds.stripe;
  // stripe isn't configured on this deploy (manual-only), or the resolved kind
  // doesn't expose the setup capability. Detect the capability explicitly — the
  // optional member is present only on kinds that actually support setup.
  if (!kind?.setupPaymentMethod) {
    throw new SetupRejected("kind_unavailable", "payment kind not available: stripe");
  }

  const setup = await kind.setupPaymentMethod({
    customer: input.customer,
    metadata: input.metadata,
  });

  await deps.auditor.record({
    action: "billing.setup.created",
    outcome: "success",
    actor: { type: "service", id: clientId },
    targetType: "payment_method_setup",
    targetId: setup.customer,
    meta: { kind: input.kind, customer: setup.customer },
  });

  return setup;
}

/** Fetch a saved method's displayable bits (brand/last4/expiry) — only the
 *  stripe kind has a processor to ask. Rejects when stripe is unconfigured. */
export async function getPaymentMethod(deps: BillingDeps, id: string): Promise<SavedCardInfo> {
  const kind = deps.kinds.stripe;
  if (!kind?.getPaymentMethod) {
    throw new SetupRejected("kind_unavailable", "payment kind not available: stripe");
  }
  return kind.getPaymentMethod(id);
}
