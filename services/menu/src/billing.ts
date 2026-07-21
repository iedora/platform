// Menu's billing surface — now backed by @iedora/sdk/billing (the shared client
// for the billing service). Menu still mints a service token via auth's
// client-credentials grant and hands it to the SDK. The local PlanSource /
// BillingReader / BillingWriter interfaces + plan cache stay so nothing that
// depends on BillingClient has to change.

import { BillingClient as SdkBillingClient } from "@iedora/sdk/billing";
import type { Invoice, Subscription } from "@iedora/contracts";
import { ServiceTokenSource, type TokenSource } from "@iedora/auth-sdk/tokens";

// Re-exported for existing local importers (audit-read, auth-client, index).
export { ServiceTokenSource };

export interface PlanSource {
  // planCode resolves a tenant's active menu plan code; "" means unsubscribed.
  planCode(tenantId: string): Promise<string>;
}

// Billing read surface the staff/admin aggregation needs (subscriptions +
// invoices for a tenant). Separate from PlanSource so tests can stub just this.
export interface BillingReader {
  subscriptions(tenantId: string): Promise<Subscription[]>;
  invoices(tenantId: string): Promise<Invoice[]>;
}

// Billing write surface for staff actions — recording a manual (cash) payment
// against a tenant. Separate from the readers so tests can stub just this.
export interface RecordPaymentInput {
  tenantId: string;
  planCode: string;
  amountCents: number;
  currency: string;
  promo?: string;
  /** The staff user who recorded the payment, for the audit trail. */
  actorId?: string;
}
export interface BillingWriter {
  recordPayment(input: RecordPaymentInput): Promise<Invoice>;
}

// BillingClient reads the tenant's menu subscription from the billing service.
export class BillingClient implements PlanSource, BillingReader, BillingWriter {
  private readonly sdk: SdkBillingClient;

  // Depends on the TokenSource interface (ServiceTokenSource satisfies it in
  // prod; a stub token source wires it in integration tests).
  constructor(base: string, tokens: TokenSource) {
    this.sdk = new SdkBillingClient({ baseUrl: base, tokens });
  }

  // The plan gate calls planCode on every gated write, but a tenant's plan
  // changes rarely. Cache it for a short window to drop a cross-service HTTP
  // round-trip (+ JSON parse) off the write path. Stale by at most PLAN_TTL_MS;
  // the gate fails open, so a slightly stale code is harmless.
  private readonly planCache = new Map<string, { code: string; expiresAt: number }>();
  private static readonly PLAN_TTL_MS = 30_000;

  async planCode(tenantId: string): Promise<string> {
    const hit = this.planCache.get(tenantId);
    if (hit && Date.now() < hit.expiresAt) return hit.code;
    const subs = await this.subscriptions(tenantId);
    const active = subs.find((s) => s.product === "menu" && s.status === "active");
    const code = active?.planCode ?? "";
    this.planCache.set(tenantId, { code, expiresAt: Date.now() + BillingClient.PLAN_TTL_MS });
    return code;
  }

  subscriptions(tenantId: string): Promise<Subscription[]> {
    return this.sdk.listSubscriptions(tenantId);
  }

  invoices(tenantId: string): Promise<Invoice[]> {
    return this.sdk.listInvoices(`tenant=${encodeURIComponent(tenantId)}`);
  }

  // Record a manual (cash) payment as a paid invoice. The plan code changes
  // rarely, so drop the cached value for this tenant to keep the next read fresh.
  async recordPayment(input: RecordPaymentInput): Promise<Invoice> {
    const invoice = await this.sdk.recordPayment({
      tenant: input.tenantId,
      product: "menu",
      planCode: input.planCode,
      amountCents: input.amountCents,
      currency: input.currency,
      status: "paid",
      ...(input.promo ? { promo: input.promo } : {}),
      ...(input.actorId ? { actorId: input.actorId } : {}),
    });
    this.planCache.delete(input.tenantId);
    return invoice;
  }
}
