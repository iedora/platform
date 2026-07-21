import {
  EmailError,
  type EmailDelivery,
  type EmailFilter,
  type EmailMessage,
  type EmailQueryResponse,
  type EmailSink,
  type TokenSource,
} from "./types.ts"

export type EmailClientOptions = {
  /** The email service's public URL, e.g. https://email.iedora.com. */
  baseUrl: string
  /** A source of bearer service tokens (minted from @iedora/auth-sdk). */
  tokens: TokenSource
  /** Override the fetch implementation (tests, custom agents). */
  fetch?: typeof fetch
}

/**
 * A typed client for the email service's send endpoint. A producer's relay
 * drains its outbox and pushes the batch through {@link deliver}; the email
 * service dedupes on `messageId` and sends each message over SMTP. Every call
 * is authed with a bearer service token and throws {@link EmailError} on a
 * non-2xx.
 *
 * ```ts
 * const email = new EmailClient({
 *   baseUrl: "https://email.iedora.com",
 *   tokens: { token: () => minter.get() },
 * })
 * await email.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>", text: "hi" })
 * ```
 */
export class EmailClient implements EmailSink {
  private readonly base: string
  private readonly tokens: TokenSource
  private readonly doFetch: typeof fetch

  constructor(opts: EmailClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, "")
    this.tokens = opts.tokens
    this.doFetch = opts.fetch ?? fetch
  }

  /** POST /messages — deliver a batch of queued emails (the relay path). */
  async deliver(messages: EmailDelivery[]): Promise<void> {
    if (messages.length === 0) return
    await this.post({ messages })
  }

  /** POST /messages — send one email now (a direct, non-relayed send). */
  async send(msg: EmailMessage): Promise<void> {
    await this.post({ messages: [{ payload: msg }] })
  }

  /**
   * GET /deliveries — read the delivery log (newest-first). Used by the platform
   * super-admin to answer "was this email sent?". Page with the returned `next`
   * cursor: `query({ ...next })`.
   */
  async query(filter: EmailFilter = {}): Promise<EmailQueryResponse> {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(filter)) if (v != null) qs.set(k, String(v))
    const res = await this.doFetch(`${this.base}/deliveries?${qs.toString()}`, {
      headers: { authorization: `Bearer ${await this.tokens.token()}` },
    })
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { message?: string }
      throw new EmailError(res.status, e.message)
    }
    return (await res.json()) as EmailQueryResponse
  }

  private async post(body: unknown): Promise<void> {
    const res = await this.doFetch(`${this.base}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.tokens.token()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { message?: string }
      throw new EmailError(res.status, e.message)
    }
  }
}
