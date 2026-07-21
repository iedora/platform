import { createRemoteJWKSet, jwtVerify } from "jose"

import type { AuthClaims } from "./types.ts"

export type VerifierOptions = {
  /** The auth service's public URL, e.g. https://auth.example.com. Also the `iss`. */
  issuer: string
  /** Expected audience (usually your tenant slug). Omit to skip the aud check. */
  audience?: string
}

/**
 * Server-side token verification against the service's JWKS. The key set is
 * fetched once and cached (and refreshed on rotation), so verifying is local and
 * fast — the auth service is never in your request path.
 *
 * ```ts
 * const verify = createAuthVerifier({ issuer: "https://auth.example.com", audience: "acme" })
 * const claims = await verify(accessToken) // throws on invalid/expired
 * ```
 */
export function createAuthVerifier(opts: VerifierOptions) {
  const issuer = opts.issuer.replace(/\/$/, "")
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))

  return async function verify(token: string): Promise<AuthClaims> {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: opts.audience,
    })
    return payload as AuthClaims
  }
}
