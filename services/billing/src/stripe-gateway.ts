import {
  type Charge,
  type ChargeInput,
  PaymentError,
  type PaymentGateway,
  type PaymentStatus,
  type Refund,
  type RefundInput,
  type Setup,
  type SetupInput,
  type Transfer,
  type TransferInput,
} from "@iedora/billing";
import Stripe from "stripe";

import type { PaymentKind, RefundRequest, RefundResult, SettleInput, Settlement } from "./kinds";

// The Stripe adapter — implements @iedora/billing's PaymentGateway against
// Stripe PaymentIntents / SetupIntents / Refunds / Transfers. Lives in the
// billing service (the one place that talks to a processor), never leaks Stripe
// types past this file. Amounts are Money minor units; currency lower-cased for
// Stripe. All errors are normalized to PaymentError.
export class StripeGateway implements PaymentGateway {
  constructor(private readonly stripe: Stripe) {}

  async charge(input: ChargeInput): Promise<Charge> {
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: input.amount.amount,
          currency: input.amount.currency.toLowerCase(),
          customer: input.customer,
          payment_method: input.paymentMethod,
          off_session: input.offSession,
          // Confirm immediately when charging a saved method; otherwise return a
          // client secret for the client to confirm.
          confirm: Boolean(input.paymentMethod),
          description: input.description,
          metadata: input.metadata,
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );
      return {
        id: pi.id,
        status: mapIntentStatus(pi.status),
        amount: input.amount,
        clientSecret: pi.client_secret ?? undefined,
      };
    } catch (err) {
      throw toPaymentError(err);
    }
  }

  async refund(input: RefundInput): Promise<Refund> {
    try {
      const r = await this.stripe.refunds.create(
        { payment_intent: input.payment, amount: input.amount?.amount, reason: reason(input.reason) },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );
      return {
        id: r.id,
        status: mapRefundStatus(r.status),
        amount: input.amount ?? { amount: r.amount, currency: r.currency.toUpperCase() },
      };
    } catch (err) {
      throw toPaymentError(err);
    }
  }

  async setupPaymentMethod(input: SetupInput): Promise<Setup> {
    try {
      const customer = input.customer ?? (await this.stripe.customers.create({ metadata: input.metadata })).id;
      const si = await this.stripe.setupIntents.create({ customer, metadata: input.metadata });
      if (!si.client_secret) throw new PaymentError("provider_error", "stripe setup intent returned no client secret");
      return { clientSecret: si.client_secret, customer };
    } catch (err) {
      throw toPaymentError(err);
    }
  }

  async transfer(input: TransferInput): Promise<Transfer> {
    try {
      const t = await this.stripe.transfers.create(
        {
          amount: input.amount.amount,
          currency: input.amount.currency.toLowerCase(),
          destination: input.destination,
          metadata: input.metadata,
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );
      return { id: t.id, status: "paid", amount: input.amount };
    } catch (err) {
      throw toPaymentError(err);
    }
  }
}

export interface StripeConfig {
  secretKey: string;
  /** Point at stripe-mock for local/dev/tests (host + port, http). */
  apiHost?: string;
  apiPort?: number;
}

/** Build a StripeGateway, or null when no secret key is configured (manual-only
 *  deploys need no Stripe). */
export function createStripeGateway(cfg: StripeConfig): StripeGateway | null {
  if (!cfg.secretKey) return null;
  const stripe = new Stripe(cfg.secretKey, {
    ...(cfg.apiHost ? { host: cfg.apiHost, port: cfg.apiPort ?? 12111, protocol: "http" as const } : {}),
  });
  return new StripeGateway(stripe);
}

// The `stripe` payment KIND — the explicit `mode` contract over the processor.
// No inference: `mode` is required, and the paymentMethod combo is validated.
export class StripeKind implements PaymentKind {
  constructor(private readonly gateway: StripeGateway) {}

  validate(input: SettleInput): string | null {
    if (input.mode !== "charge" && input.mode !== "intent") {
      return 'stripe requires mode: "charge" | "intent"';
    }
    if (input.mode === "charge" && !input.paymentMethod) {
      return "stripe mode 'charge' requires a paymentMethod (a saved card to charge off-session)";
    }
    if (input.mode === "intent" && input.paymentMethod) {
      return "stripe mode 'intent' must not include a paymentMethod (the client confirms)";
    }
    return null;
  }

  async settle(input: SettleInput): Promise<Settlement> {
    // charge → off-session with the saved method; intent → no method, returns a
    // client secret. The gateway confirms iff a paymentMethod is present.
    const charge = await this.gateway.charge({
      amount: input.amount,
      customer: input.customer,
      paymentMethod: input.paymentMethod,
      offSession: input.mode === "charge",
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      metadata: input.metadata,
    });
    return { providerRef: charge.id, status: charge.status, clientSecret: charge.clientSecret };
  }

  async refund(input: RefundRequest): Promise<RefundResult> {
    if (!input.payment) throw new PaymentError("provider_error", "stripe refund needs a provider payment id");
    const r = await this.gateway.refund({
      payment: input.payment,
      amount: input.amount,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    return { providerRef: r.id, amount: r.amount, status: r.status };
  }

  setupPaymentMethod(input: SetupInput): Promise<Setup> {
    return this.gateway.setupPaymentMethod(input);
  }
}

/** Build the stripe kind, or null when Stripe isn't configured. */
export function createStripeKind(cfg: StripeConfig): StripeKind | null {
  const gateway = createStripeGateway(cfg);
  return gateway ? new StripeKind(gateway) : null;
}

function mapIntentStatus(s: Stripe.PaymentIntent.Status): PaymentStatus {
  switch (s) {
    case "succeeded":
      return "paid";
    case "requires_action":
    case "requires_confirmation":
    case "requires_payment_method":
      return "requires_action";
    case "processing":
      return "pending";
    case "canceled":
      return "canceled";
    default:
      return "pending";
  }
}

function mapRefundStatus(s: string | null): Refund["status"] {
  if (s === "succeeded") return "succeeded";
  if (s === "failed" || s === "canceled") return "failed";
  return "pending";
}

function reason(r?: string): Stripe.RefundCreateParams.Reason | undefined {
  return r === "duplicate" || r === "fraudulent" || r === "requested_by_customer" ? r : undefined;
}

function toPaymentError(err: unknown): PaymentError {
  if (err instanceof PaymentError) return err;
  const e = err as { type?: string; code?: string; message?: string };
  const code =
    e?.code === "card_declined"
      ? "card_declined"
      : e?.code === "insufficient_funds"
        ? "insufficient_funds"
        : e?.type === "StripeAuthenticationError"
          ? "authentication_required"
          : e?.type === "StripeRateLimitError"
            ? "rate_limited"
            : "provider_error";
  return new PaymentError(code, e?.message ?? "stripe error", { cause: err });
}
