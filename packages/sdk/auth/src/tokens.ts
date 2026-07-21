// Client-credentials service-token source — the caller half of service-to-service
// auth. A service (or a product's server) that calls a peer over HTTP obtains a
// service token by presenting its client id + secret to auth's client-credentials
// grant, caches it until shortly before expiry, and hands it to an authed client
// (e.g. @iedora/billing-sdk, @iedora/audit-sdk) as the outbound Bearer.
//
// Lives here (not the auth service, not framework runtime) because minting is an
// auth-client concern: it only talks to auth's client-credentials grant at
// `POST /token`. Zero runtime deps beyond fetch + btoa, so it stays portable
// across Node/Bun/edge and importing it never pulls in jose (the verifier's dep).

/** Anything that can mint/return a bearer token. */
export interface TokenSource {
  token(): Promise<string>
}

export class ServiceTokenSource implements TokenSource {
  private cached = ""
  private expiresAtMs = 0
  private inflight: Promise<string> | null = null // de-dupes concurrent cold-cache mints

  constructor(
    private readonly authBaseUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    // The client-credentials grant is root-mounted at POST /token (auth
    // src/index.ts). Must match `mintServiceToken` in client.ts, or cached
    // callers (billing-sdk, audit-sdk, tutor→billing) 404 on mint.
    private readonly tokenPath = "/token",
  ) {}

  async token(): Promise<string> {
    // Refresh a minute before expiry to absorb clock skew + request latency.
    if (this.cached && Date.now() < this.expiresAtMs - 60_000) return this.cached
    // Several calls may fire at once on a cold/expired cache; share one mint.
    this.inflight ??= this.mint().finally(() => {
      this.inflight = null
    })
    return this.inflight
  }

  private async mint(): Promise<string> {
    const basic = btoa(`${this.clientId}:${this.clientSecret}`)
    const res = await fetch(`${this.authBaseUrl}${this.tokenPath}`, {
      method: "POST",
      headers: { authorization: `Basic ${basic}` },
    })
    if (!res.ok) throw new Error(`auth: token endpoint returned ${res.status}`)
    const body = (await res.json()) as { accessToken: string }
    this.cached = body.accessToken
    this.expiresAtMs = jwtExpiryMs(body.accessToken) ?? Date.now() + 9 * 60_000
    return this.cached
  }
}

/** Reads the `exp` claim (seconds) without verifying — we minted the token; this
 *  only schedules the refresh. */
export function jwtExpiryMs(token: string): number | undefined {
  const part = token.split(".")[1]
  if (!part) return undefined
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"))
    const payload = JSON.parse(json) as { exp?: number }
    return typeof payload.exp === "number" ? payload.exp * 1000 : undefined
  } catch {
    return undefined
  }
}
