import crypto from "node:crypto"

import type { OAuthProvider, ProviderProfile } from "./types"

/**
 * Config for a generic OAuth2 / OIDC provider. Endpoints + client credentials come
 * from the tenant's DB row, so Google, GitHub, Microsoft, Auth0, Keycloak, or any
 * OIDC IdP all work by configuration alone. Field names default to the OIDC
 * standard userinfo shape; override them for a non-standard provider.
 */
export type OAuthConfig = {
  authorizationEndpoint: string
  tokenEndpoint: string
  userinfoEndpoint: string
  clientId: string
  clientSecret: string
  scope?: string
  subjectField?: string
  emailField?: string
  nameField?: string
  /** Some providers (e.g. GitHub) don't return the email in userinfo — set this
   *  to a `[{ email, primary, verified }]` endpoint and it's used as a fallback
   *  when the userinfo email is absent. Keeps email capture generic. */
  emailsEndpoint?: string
}

/** base64url without padding — the encoding PKCE (RFC 7636) mandates. */
function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Generate a PKCE verifier + its S256 challenge. The verifier is kept server-side
 *  (an httpOnly cookie) until the callback; the challenge goes to the provider. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest())
  return { verifier, challenge }
}

/** Fetch a `[{ email, primary, verified }]` endpoint and pick the best email —
 *  the generic fallback for providers that omit it from userinfo. */
async function fetchFallbackEmail(
  endpoint: string,
  accessToken: string,
): Promise<{ email?: string; verified: boolean }> {
  const res = await fetch(endpoint, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      "user-agent": "iedora-auth", // some providers (GitHub) require a UA
    },
  })
  if (!res.ok) return { email: undefined, verified: false }
  const list = (await res.json()) as { email?: string; primary?: boolean; verified?: boolean }[]
  const pick =
    list.find((e) => e.primary && e.verified) ?? list.find((e) => e.verified) ?? list[0]
  return { email: pick?.email, verified: Boolean(pick?.verified) }
}

export function oauthProvider(id: string, cfg: OAuthConfig): OAuthProvider {
  return {
    id,
    kind: "oauth2",

    authorizationUrl({ state, redirectUri, codeChallenge }) {
      const url = new URL(cfg.authorizationEndpoint)
      url.searchParams.set("response_type", "code")
      url.searchParams.set("client_id", cfg.clientId)
      url.searchParams.set("redirect_uri", redirectUri)
      url.searchParams.set("scope", cfg.scope ?? "openid email profile")
      url.searchParams.set("state", state)
      // PKCE (RFC 7636): bind this authorization to a secret only we hold.
      url.searchParams.set("code_challenge", codeChallenge)
      url.searchParams.set("code_challenge_method", "S256")
      return url.toString()
    },

    async exchangeCode({ code, redirectUri, codeVerifier }): Promise<ProviderProfile> {
      const tokenRes = await fetch(cfg.tokenEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          code_verifier: codeVerifier,
        }),
      })
      if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`)
      const tok = (await tokenRes.json()) as { access_token?: string }
      if (!tok.access_token) throw new Error("provider returned no access token")

      const userRes = await fetch(cfg.userinfoEndpoint, {
        headers: {
          authorization: `Bearer ${tok.access_token}`,
          accept: "application/json",
          "user-agent": "iedora-auth", // some providers (GitHub) require a UA
        },
      })
      if (!userRes.ok) throw new Error(`userinfo failed (${userRes.status})`)
      const info = (await userRes.json()) as Record<string, unknown>

      const subject = String(info[cfg.subjectField ?? "sub"] ?? "")
      if (!subject) throw new Error("provider userinfo has no subject")

      let email = info[cfg.emailField ?? "email"] as string | undefined
      let emailVerified = Boolean(info.email_verified ?? false)
      // Fallback for providers that don't include email in userinfo (GitHub).
      if (!email && cfg.emailsEndpoint && tok.access_token) {
        const fallback = await fetchFallbackEmail(cfg.emailsEndpoint, tok.access_token)
        email = fallback.email
        emailVerified = fallback.verified
      }

      return {
        subject,
        email,
        emailVerified,
        name: (info[cfg.nameField ?? "name"] as string | undefined) ?? null,
        raw: info,
      }
    },
  }
}
