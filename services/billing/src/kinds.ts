import type { Money, PaymentStatus } from "@iedora/billing";

// Payment KINDS — the pluggable registry the billing service settles through.
// A kind is either RECORD-ONLY (manual: money moved off-platform, we just record
// it settled) or a PROCESSOR (stripe: talks to a provider). Manual is NOT a
// gateway — only processors implement @iedora/billing's PaymentGateway.
//
// Everything explicit (project rule): the caller names the `kind`; a kind that
// needs more (stripe's `mode`) validates the request and rejects a bad combo
// rather than inferring anything.

/** What a kind needs to settle one charge. Stripe fields are ignored by manual. */
export interface SettleInput {
  amount: Money;
  /** stripe: "charge" (off-session saved card) | "intent" (client confirms). Required for stripe. */
  mode?: "charge" | "intent";
  customer?: string;
  paymentMethod?: string;
  idempotencyKey?: string;
  description?: string;
  metadata?: Record<string, string>;
}

/** The outcome of settling. `providerRef` is null for manual; `clientSecret` is
 *  set only for a stripe intent the client must confirm. */
export interface Settlement {
  providerRef: string | null;
  status: PaymentStatus;
  clientSecret?: string;
}

export interface PaymentKind {
  /** Validate the request for this kind. Return an error message to reject, or
   *  null to proceed. Enforces the explicit contract (no inference). */
  validate(input: SettleInput): string | null;
  settle(input: SettleInput): Promise<Settlement>;
}

/** kind name → handler. A name absent here is not configured (→ 400). */
export type PaymentKinds = Record<string, PaymentKind>;

/** Register-only: the money moved outside the platform (cash, transfer); we record
 *  it as settled. No processor, no provider ref. */
export class ManualKind implements PaymentKind {
  validate(): string | null {
    return null; // manual takes no extra fields
  }
  async settle(): Promise<Settlement> {
    return { providerRef: null, status: "paid" };
  }
}
