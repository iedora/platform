import {
  AuditError,
  type AuditDelivery,
  type AuditFilter,
  type AuditQueryResponse,
  type AuditSink,
  type TokenSource,
} from "./types.ts"

export type AuditClientOptions = {
  /** The audit service's public URL, e.g. https://audit.iedora.com. */
  baseUrl: string
  /** A source of bearer service tokens (minted from @iedora/auth-sdk). */
  tokens: TokenSource
  /** Override the fetch implementation (tests, custom agents). */
  fetch?: typeof fetch
}

/**
 * A typed client for the audit service's ingest endpoint. A producer's relay
 * drains its outbox and pushes the batch through {@link ingest}; the audit
 * service dedupes on `messageId` and stores each event. Every call is authed
 * with a bearer service token and throws {@link AuditError} on a non-2xx.
 *
 * ```ts
 * const audit = new AuditClient({
 *   baseUrl: "https://audit.iedora.com",
 *   tokens: { token: () => minter.get() },
 * })
 * await audit.ingest([{ messageId: row.id, payload: row.payload }])
 * ```
 */
export class AuditClient implements AuditSink {
  private readonly base: string
  private readonly tokens: TokenSource
  private readonly doFetch: typeof fetch

  constructor(opts: AuditClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, "")
    this.tokens = opts.tokens
    this.doFetch = opts.fetch ?? fetch
  }

  async ingest(events: AuditDelivery[]): Promise<void> {
    if (events.length === 0) return
    const res = await this.doFetch(`${this.base}/events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.tokens.token()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ events }),
    })
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { message?: string }
      throw new AuditError(res.status, e.message)
    }
  }

  /** GET /obs/events — query the log (filters + keyset cursor), newest-first.
   *  This is how any service reads audit through the SDK instead of touching a
   *  database. */
  async query(filter: AuditFilter = {}): Promise<AuditQueryResponse> {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(filter)) if (v != null) qs.set(k, String(v))
    const res = await this.doFetch(`${this.base}/obs/events?${qs.toString()}`, {
      headers: { authorization: `Bearer ${await this.tokens.token()}` },
    })
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { message?: string }
      throw new AuditError(res.status, e.message)
    }
    return (await res.json()) as AuditQueryResponse
  }
}
