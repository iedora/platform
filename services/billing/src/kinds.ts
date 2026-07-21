import type { Money, PaymentStatus, Setup, SetupInput } from "./money/index.ts";

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

/** A refund's terminal/known state. manual settles `refunded`; stripe reports
 *  the provider's `pending | succeeded | failed`. */
export type RefundStatus = "refunded" | "pending" | "succeeded" | "failed";

/** What a kind needs to refund. `payment` is the original charge's provider ref
 *  (null for manual); `amount` is resolved explicitly by the caller. */
export interface RefundRequest {
  payment: string | null;
  amount: Money;
  reason?: string;
  idempotencyKey?: string;
}

export interface RefundResult {
  providerRef: string | null;
  amount: Money;
  status: RefundStatus;
}

/** Displayable, non-sensitive bits of a saved payment method (never the PAN). */
export interface SavedCardInfo {
  brand: string;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export interface PaymentKind {
  /** Validate the request for this kind. Return an error message to reject, or
   *  null to proceed. Enforces the explicit contract (no inference). */
  validate(input: SettleInput): string | null;
  settle(input: SettleInput): Promise<Settlement>;
  /** Optional: refund a settled charge. Present only on kinds that support it
   *  (manual records; stripe processes). Absence = not supported. */
  refund?(input: RefundRequest): Promise<RefundResult>;
  /** Optional: begin saving a payment method for later off-session charges
   *  (a SetupIntent). Present only on kinds that support it (stripe). */
  setupPaymentMethod?(input: SetupInput): Promise<Setup>;
  /** Optional: fetch a saved method's displayable bits (brand/last4/expiry).
   *  Present only on kinds that have a processor (stripe). */
  getPaymentMethod?(id: string): Promise<SavedCardInfo>;
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
  // A manual refund records the reversal off-platform; no processor.
  async refund(input: RefundRequest): Promise<RefundResult> {
    return { providerRef: null, amount: input.amount, status: "refunded" };
  }
  // Manual has no setupPaymentMethod — cards can't be saved off-platform.
}
