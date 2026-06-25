// Client for the billing service's plan lookups. The menu service authenticates
// with a service token it mints via auth's client-credentials grant (/auth/token),
// caches it until shortly before expiry, and presents it as a Bearer to billing.

import type { Invoice, Subscription } from "@iedora/contracts";
import { ServiceClient, type TokenSource } from "@iedora/server-kit";

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

// ServiceTokenSource mints + caches a client-credentials service token.
export class ServiceTokenSource {
  private cached = "";
  private expiresAtMs = 0;
  private inflight: Promise<string> | null = null; // de-dupes concurrent cold-cache mints

  constructor(
    private readonly authBaseUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async token(): Promise<string> {
    // Refresh a minute before expiry to absorb clock skew + request latency.
    if (this.cached && Date.now() < this.expiresAtMs - 60_000) return this.cached;
    // The admin aggregation fires several reads at once; on a cold/expired cache
    // they'd otherwise each mint a token. Share a single in-flight mint instead.
    this.inflight ??= this.mint().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async mint(): Promise<string> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(`${this.authBaseUrl}/auth/token`, {
      method: "POST",
      headers: { authorization: `Basic ${basic}` },
    });
    if (!res.ok) throw new Error(`auth: token endpoint returned ${res.status}`);
    const body = (await res.json()) as { accessToken: string };
    this.cached = body.accessToken;
    this.expiresAtMs = jwtExpiryMs(body.accessToken) ?? Date.now() + 9 * 60_000;
    return this.cached;
  }
}

// jwtExpiryMs reads the `exp` claim (seconds) without verifying — we minted the
// token, this only schedules the refresh.
function jwtExpiryMs(token: string): number | undefined {
  const part = token.split(".")[1];
  if (!part) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

// BillingClient reads the tenant's menu subscription from the billing service.
export class BillingClient implements PlanSource, BillingReader, BillingWriter {
  private readonly client: ServiceClient;

  // Depends on the TokenSource interface (ServiceTokenSource satisfies it in
  // prod; a stub token source wires it in integration tests).
  constructor(base: string, tokens: TokenSource) {
    this.client = new ServiceClient(base, tokens, "billing");
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

  async subscriptions(tenantId: string): Promise<Subscription[]> {
    const out = await this.client.get<{ subscriptions: Subscription[] }>(
      `/billing/subscriptions?tenant=${encodeURIComponent(tenantId)}`,
    );
    return out.subscriptions;
  }

  async invoices(tenantId: string): Promise<Invoice[]> {
    const out = await this.client.get<{ invoices: Invoice[] }>(
      `/billing/invoices?tenant=${encodeURIComponent(tenantId)}`,
    );
    return out.invoices;
  }

  // Record a manual (cash) payment as a paid invoice. The plan code changes
  // rarely, so drop the cached value for this tenant to keep the next read fresh.
  async recordPayment(input: RecordPaymentInput): Promise<Invoice> {
    const out = await this.client.post<{ invoice: Invoice }>("/billing/invoices", {
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
    return out.invoice;
  }
}
