// Client-side counterpart to serviceAuth: a thin authed-fetch base for
// service-to-service calls. Hold a ServiceClient (base URL + a token source) so
// each endpoint method is one line instead of the repeated token() → fetch
// (Bearer) → !res.ok throw → json() boilerplate.

/** Anything that can mint/return a service bearer token. */
export interface TokenSource {
  token(): Promise<string>
}

/** Transform outbound headers — e.g. inject a W3C traceparent. Kept as an
 *  injectable hook so this stays free of any tracing/observability dependency. */
export type HeaderTransform = (headers: Record<string, string>) => Record<string, string>

/** Thrown on a non-2xx service response; carries the upstream `status`. */
export class ServiceClientError extends Error {
  constructor(
    service: string,
    path: string,
    readonly status: number,
  ) {
    super(`${service}: ${path} returned ${status}`)
    this.name = "ServiceClientError"
  }
}

export class ServiceClient {
  private readonly headers: HeaderTransform
  constructor(
    private readonly base: string,
    private readonly tokens: TokenSource,
    /** Service name, used in thrown error messages (e.g. "billing"). */
    private readonly name: string,
    /** Optional outbound-header transform (e.g. traceparent injection). */
    headers?: HeaderTransform,
  ) {
    this.headers = headers ?? ((h) => h)
  }

  /**
   * GET `path` with a Bearer token, parsing the JSON body as `T`. A status in
   * `allow` returns null instead of throwing; any other non-2xx throws.
   */
  async get<T>(path: string): Promise<T>
  async get<T>(path: string, allow: number[]): Promise<T | null>
  async get<T>(path: string, allow: number[] = []): Promise<T | null> {
    const token = await this.tokens.token()
    const res = await fetch(`${this.base}${path}`, {
      headers: this.headers({ authorization: `Bearer ${token}` }),
    })
    if (allow.includes(res.status)) return null
    if (!res.ok) throw new ServiceClientError(this.name, path, res.status)
    return (await res.json()) as T
  }

  /** POST `body` as JSON with a Bearer token, parsing the JSON response as `T`. */
  async post<T>(path: string, body: unknown): Promise<T> {
    const token = await this.tokens.token()
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: this.headers({ authorization: `Bearer ${token}`, "content-type": "application/json" }),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new ServiceClientError(this.name, path, res.status)
    return (await res.json()) as T
  }
}
