// Wire shapes for the @iedora billing service. Mirrors the service's zod request
// schemas and its record rows. Amounts are ALWAYS integer minor units (cents) on
// the wire — the service holds Money internally; the SDK speaks plain integers so
// it stays dependency-free and edge/Node/Bun portable.

/** Settlement status of a charge, as returned by the service. */
export type PaymentStatus =
  | "pending"
  | "requires_action"
  | "paid"
  | "failed"
  | "refunded"
  | "canceled"

/** The explicit stripe settlement mode. `charge` = off-session against a saved
 *  card (requires `paymentMethod`); `intent` = the client confirms (no method). */
export type ChargeMode = "charge" | "intent"

/**
 * Create a one-off charge. Everything explicit (no inference): the caller names
 * the settlement `kind`, and — for the stripe kind — the `mode`. A marketplace
 * split happens only when BOTH `payee` and `feeRate` are given.
 */
export type ChargeInput = {
  /** Product/context label the charge is recorded under. */
  product: string
  /** The payer (opaque product id; the charge is tenant-scoped to this). */
  payer: string
  /** Marketplace payee. Omit for a platform-only charge. */
  payee?: string
  /** Integer minor units (cents), positive. */
  amountCents: number
  /** ISO 4217, 3 letters (e.g. "USD"). */
  currency: string
  /** REQUIRED — the settlement kind (e.g. "manual", "stripe"). No default. */
  kind: string
  /** stripe kind: required, "charge" | "intent". Ignored by record-only kinds. */
  mode?: ChargeMode
  /** Marketplace take-rate (0..1). With `payee`, splits gross → fee + payee net. */
  feeRate?: number
  /** Provider customer id (e.g. a Stripe customer) for off-session charges. */
  customer?: string
  /** Provider saved-method id to charge off-session (stripe mode "charge"). */
  paymentMethod?: string
  /** Dedupe retries so a network retry never double-charges. */
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}

/** A charge row as stored by the service. Amounts are integer minor units. */
export type ChargeRecord = {
  id: string
  product: string
  payer: string
  payee: string | null
  amountCents: number
  currency: string
  feeCents: number
  netCents: number
  status: PaymentStatus
  provider: string
  providerRef: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

/** createCharge's response: the stored row, plus a transient `clientSecret` for a
 *  stripe intent the client must confirm (never persisted). */
export type CreatedCharge = ChargeRecord & { clientSecret?: string }

/**
 * Begin saving a payment method for later off-session charges (a provider setup
 * intent). Pass an existing provider `customer` to attach to it, or omit to have
 * the service create one.
 */
export type SetupPaymentMethodInput = {
  /** REQUIRED — the kind. Only "stripe" supports setup. */
  kind: string
  customer?: string
  metadata?: Record<string, string>
}

/** setupPaymentMethod's response — confirm `clientSecret` on the client. */
export type SetupResult = {
  /** Confirm this on the client to attach the method. */
  clientSecret: string
  /** The provider customer the method attaches to (created if it didn't exist). */
  customer: string
}

/**
 * Record a payout to a payee. RECORD-ONLY: this books the payout as `pending`;
 * execution (the actual money movement) is a later step. No `kind` — it isn't
 * settled here.
 */
export type PayoutInput = {
  /** Marketplace payee (opaque product id). */
  payee: string
  /** Integer minor units (cents), positive. */
  amountCents: number
  /** ISO 4217, 3 letters. */
  currency: string
  /** Product/context label. */
  product?: string
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}

/** A payout row as stored by the service. Amounts are integer minor units. */
export type PayoutRecord = {
  id: string
  product: string | null
  payee: string
  amountCents: number
  currency: string
  status: "pending" | "paid" | "failed"
  provider: string | null
  providerRef: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

/**
 * Refund a charge (by its service charge id in the path). Omit `amountCents` to
 * refund in full; pass it for a partial refund.
 */
export type RefundInput = {
  /** Partial amount in integer minor units; omit to refund in full. */
  amountCents?: number
  reason?: string
  idempotencyKey?: string
}

/** A refund row as stored by the service. `refunded` = a manual (record-only)
 *  reversal; the rest are the stripe provider states. */
export type RefundRecord = {
  id: string
  chargeId: string
  product: string
  amountCents: number
  currency: string
  status: "refunded" | "pending" | "succeeded" | "failed"
  provider: string
  providerRef: string | null
  createdAt: string
}

// ── Subscriptions + invoices (the SaaS billing surface) ──────────────────────
/** A tenant's current plan for one product. */
export type Subscription = {
  id: string
  tenantId: string
  product: string
  planCode: string
  status: string // active | canceled
  currentPeriodEnd?: string
  canceledAt?: string
  createdAt: string
  updatedAt: string
}

/** An append-only ledger entry snapshotting plan_code + amount. */
export type Invoice = {
  id: string
  tenantId: string
  product: string
  planCode: string
  amountCents: number
  currency: string
  status: string // issued | paid | void
  promo?: string | null
  createdAt: string
}

/** POST /billing/subscribe — activate/change a tenant's plan. */
export type SubscribeInput = { tenantId: string; planCode: string }
/** POST /billing/cancel — end a tenant's subscription for a product. */
export type CancelInput = { tenantId: string; product: string }
/** POST /billing/invoices — record a (manual/cash) payment as a paid invoice. */
export type RecordPaymentInput = {
  tenant: string
  product: string
  planCode: string
  amountCents: number
  currency: string
  status?: string
  promo?: string
  actorId?: string
}

/** Displayable, non-sensitive bits of a saved payment method. */
export type SavedCardInfo = {
  brand: string
  last4: string | null
  expMonth: number | null
  expYear: number | null
}

/** A source of bearer service tokens (e.g. a cached client-credentials minter). */
export type TokenSource = { token(): Promise<string> }

/** Thrown by the client on a non-2xx response, carrying the service's error code. */
export class BillingError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
    this.name = "BillingError"
  }
}
