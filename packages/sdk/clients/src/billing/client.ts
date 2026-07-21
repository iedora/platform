import {
  BillingError,
  type CancelInput,
  type ChargeInput,
  type ChargeRecord,
  type CreatedCharge,
  type Invoice,
  type PayoutInput,
  type PayoutRecord,
  type RecordPaymentInput,
  type RefundInput,
  type RefundRecord,
  type SetupPaymentMethodInput,
  type SetupResult,
  type SavedCardInfo,
  type SubscribeInput,
  type Subscription,
  type TokenSource,
} from "./types"

export type BillingClientOptions = {
  /** The billing service's public URL, e.g. https://billing.iedora.com. */
  baseUrl: string
  /** A source of bearer service tokens (minted from @iedora/auth-sdk). */
  tokens: TokenSource
  /** Override the fetch implementation (tests, custom agents). */
  fetch?: typeof fetch
}

// Plain-object headers keep this portable across runtimes (Bun/Node/edge) without
// depending on an ambient `HeadersInit` lib type that would leak into every
// consumer's type environment.
type CallOpts = { method?: string; body?: unknown; allow?: number[] }

/**
 * A typed client for the billing service, mirroring its routes. Every call is
 * authed with a bearer service token from `tokens.token()` and throws a
 * {@link BillingError} on any non-2xx response.
 *
 * ```ts
 * const billing = new BillingClient({
 *   baseUrl: "https://billing.iedora.com",
 *   tokens: { token: () => minter.get() },
 * })
 * const charge = await billing.createCharge({
 *   product: "lesson", payer: "org_1", payee: "tutor_9",
 *   amountCents: 5000, currency: "USD", kind: "stripe", mode: "intent", feeRate: 0.2,
 * })
 * ```
 */
export class BillingClient {
  private readonly base: string
  private readonly tokens: TokenSource
  private readonly doFetch: typeof fetch

  constructor(opts: BillingClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, "")
    this.tokens = opts.tokens
    this.doFetch = opts.fetch ?? fetch
  }

  private async call<T>(path: string, o?: CallOpts): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.tokens.token()}`,
    }
    let body: string | undefined
    if (o?.body !== undefined) {
      headers["content-type"] = "application/json"
      body = JSON.stringify(o.body)
    }
    const res = await this.doFetch(`${this.base}${path}`, {
      method: o?.method ?? "GET",
      headers,
      body,
    })
    const data = (await res.json().catch(() => ({}))) as unknown
    if (!res.ok) {
      if (o?.allow?.includes(res.status)) return null as T
      const e = data as { error?: string; message?: string }
      throw new BillingError(res.status, e.error ?? "request_failed", e.message)
    }
    return data as T
  }

  /** POST /billing/charges — create a one-off charge (kind + mode explicit). */
  createCharge(input: ChargeInput): Promise<CreatedCharge> {
    return this.call<CreatedCharge>("/billing/charges", { method: "POST", body: input })
  }

  /** GET /billing/charges/:id — fetch a charge, or null on 404. */
  getCharge(id: string): Promise<ChargeRecord | null> {
    return this.call<ChargeRecord | null>(`/billing/charges/${encodeURIComponent(id)}`, {
      allow: [404],
    })
  }

  /** POST /billing/payouts — create a marketplace payout to a connected payee. */
  createPayout(input: PayoutInput): Promise<PayoutRecord> {
    return this.call<PayoutRecord>("/billing/payouts", { method: "POST", body: input })
  }

  /** POST /billing/payment-methods/setup — begin saving a payment method. */
  setupPaymentMethod(input: SetupPaymentMethodInput): Promise<SetupResult> {
    return this.call<SetupResult>("/billing/payment-methods/setup", { method: "POST", body: input })
  }

  /** POST /billing/charges/:id/refund — refund a charge (full unless amount given). */
  refundCharge(id: string, input: RefundInput): Promise<RefundRecord> {
    return this.call<RefundRecord>(`/billing/charges/${encodeURIComponent(id)}/refund`, {
      method: "POST",
      body: input,
    })
  }

  // ── subscriptions + invoices ───────────────────────────────────────────────
  /** GET /billing/payment-methods/:id — a saved method's displayable bits. */
  getPaymentMethod(id: string): Promise<SavedCardInfo> {
    return this.call<SavedCardInfo>(`/billing/payment-methods/${encodeURIComponent(id)}`)
  }

  /** POST /billing/subscribe — activate/change a tenant's plan. */
  subscribe(input: SubscribeInput): Promise<Subscription> {
    return this.call<Subscription>("/billing/subscribe", { method: "POST", body: input })
  }

  /** POST /billing/cancel — end a tenant's subscription for a product. */
  cancel(input: CancelInput): Promise<Subscription> {
    return this.call<Subscription>("/billing/cancel", { method: "POST", body: input })
  }

  /** GET /billing/subscriptions?tenant= — a tenant's subscriptions. */
  async listSubscriptions(tenant: string): Promise<Subscription[]> {
    const out = await this.call<{ subscriptions: Subscription[] }>(
      `/billing/subscriptions?tenant=${encodeURIComponent(tenant)}`,
    )
    return out.subscriptions
  }

  /** GET /billing/invoices?tenant= (or a recent feed) — invoices. */
  async listInvoices(query: string): Promise<Invoice[]> {
    const out = await this.call<{ invoices: Invoice[] }>(`/billing/invoices?${query}`)
    return out.invoices
  }

  /** POST /billing/invoices — record a manual/cash payment as a paid invoice. */
  async recordPayment(input: RecordPaymentInput): Promise<Invoice> {
    const out = await this.call<{ invoice: Invoice }>("/billing/invoices", { method: "POST", body: input })
    return out.invoice
  }
}
