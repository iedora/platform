import type { Money } from "./money.ts"

// The provider-agnostic payment gateway. One interface over any processor —
// Stripe (tutor), a manual/cash ledger (menu), a mock (tests), or whatever comes
// next. Products depend on THIS, never on a processor SDK, so swapping or adding
// a provider is a new adapter, not a rewrite. Everything money-typed uses Money
// (exact minor units); provider ids are opaque strings.

export type PaymentStatus =
  | "pending" // created, not yet settled
  | "requires_action" // needs client-side confirmation (e.g. 3-D Secure)
  | "paid" // funds captured
  | "failed"
  | "refunded"
  | "canceled"

/** A payer to charge. `customer`/`paymentMethod` are opaque provider refs (e.g. a
 *  Stripe customer + saved card) for off-session charges; omit for a fresh checkout. */
export interface ChargeInput {
  amount: Money
  customer?: string
  paymentMethod?: string
  /** Confirm + charge now without the customer present (a saved-card charge). */
  offSession?: boolean
  /** Dedupe retries so a network retry never double-charges. */
  idempotencyKey?: string
  description?: string
  /** Opaque product context echoed back on the provider record (never PII). */
  metadata?: Record<string, string>
}

export interface Charge {
  /** The provider's payment id. */
  id: string
  status: PaymentStatus
  amount: Money
  /** Present when `status === "requires_action"`: hand to the client to confirm. */
  clientSecret?: string
}

export interface RefundInput {
  /** The provider payment id to refund. */
  payment: string
  /** Partial amount; omit to refund in full. */
  amount?: Money
  reason?: string
  idempotencyKey?: string
}

export interface Refund {
  id: string
  status: "pending" | "succeeded" | "failed"
  amount: Money
}

/** Begin saving a payment method for later off-session charges (e.g. a Stripe
 *  SetupIntent). `clientSecret` is confirmed on the client. */
export interface SetupInput {
  customer?: string
  metadata?: Record<string, string>
}
export interface Setup {
  /** Confirm this on the client to attach the method. */
  clientSecret: string
  /** The provider customer the method attaches to (created if it didn't exist). */
  customer: string
}

/** Marketplace payout: move `amount` to a connected payee (e.g. a Stripe Connect
 *  account). `destination` is the payee's provider account id. */
export interface TransferInput {
  amount: Money
  destination: string
  idempotencyKey?: string
  metadata?: Record<string, string>
}
export interface Transfer {
  id: string
  status: "pending" | "paid" | "failed"
  amount: Money
}

/**
 * A payment provider. `charge` + `refund` are the baseline every provider supports;
 * `setupPaymentMethod` (off-session cards) and `transfer` (marketplace payouts) are
 * optional so a manual/cash adapter can omit what it can't do. Adapters live with
 * the product or as their own package (e.g. a StripeGateway), never in this domain
 * package — keeping it provider- and domain-agnostic.
 */
export interface PaymentGateway {
  charge(input: ChargeInput): Promise<Charge>
  refund(input: RefundInput): Promise<Refund>
  setupPaymentMethod?(input: SetupInput): Promise<Setup>
  transfer?(input: TransferInput): Promise<Transfer>
}

/** Thrown by adapters for a provider error, carrying a stable code the caller can
 *  branch on without importing a provider SDK's error types. */
export class PaymentError extends Error {
  constructor(
    readonly code: PaymentErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = "PaymentError"
  }
}

export type PaymentErrorCode =
  | "card_declined"
  | "insufficient_funds"
  | "authentication_required"
  | "rate_limited"
  | "provider_error"
  | "not_supported"
