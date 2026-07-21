/** A user as seen by an auth provider, normalized so slices never care which
 *  provider produced it. `subject` is the provider's stable id for this user
 *  (email for password, `sub` for OAuth/OIDC). */
export type ProviderProfile = {
  subject: string
  email?: string
  emailVerified?: boolean
  name?: string | null
  raw?: unknown
}

export interface PasswordProvider {
  id: string
  kind: "password"
  hash(password: string): Promise<string>
  verify(password: string, hash: string): Promise<boolean>
}

export interface OAuthProvider {
  id: string
  kind: "oauth2"
  /** Where to send the user to authenticate. `codeChallenge` is the PKCE S256
   *  challenge (RFC 7636) — required so an intercepted code can't be redeemed. */
  authorizationUrl(params: { state: string; redirectUri: string; codeChallenge: string }): string
  /** Exchange the returned code (with the PKCE `codeVerifier`) for a normalized
   *  profile. */
  exchangeCode(params: {
    code: string
    redirectUri: string
    codeVerifier: string
  }): Promise<ProviderProfile>
}

/**
 * The one abstraction every slice programs against. New external providers are a
 * config row (see oauth.ts + registry.ts), not a code change — that's what keeps
 * the service generic across domains and identity sources.
 */
export type AuthProvider = PasswordProvider | OAuthProvider
