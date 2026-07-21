import type { OAuthConfig } from "./oauth"

// Config presets for common OAuth2 / OIDC providers. Each returns a plain
// OAuthConfig — the generic `oauthProvider` does the rest — so adding a NEW
// provider is ONE builder here (or a raw config row for anything bespoke, or
// `oidcDiscovery` for any standards-compliant issuer). Only the per-tenant client
// credentials are supplied; endpoints/scopes are the provider's well-known values.
// Nothing here is iedora- or product-specific.

export function google(clientId: string, clientSecret: string): OAuthConfig {
  return {
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    userinfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
    clientId,
    clientSecret,
    scope: "openid email profile",
  }
}

export function github(clientId: string, clientSecret: string): OAuthConfig {
  return {
    authorizationEndpoint: "https://github.com/login/oauth/authorize",
    tokenEndpoint: "https://github.com/login/oauth/access_token",
    userinfoEndpoint: "https://api.github.com/user",
    // GitHub omits email from /user unless it's public — fall back to /user/emails.
    emailsEndpoint: "https://api.github.com/user/emails",
    clientId,
    clientSecret,
    scope: "read:user user:email",
    subjectField: "id", // GitHub's stable numeric id (stringified)
  }
}

/** Microsoft Entra ID (Azure AD). `directory` is "common" | "organizations" |
 *  "consumers" | a tenant id. */
export function microsoft(
  clientId: string,
  clientSecret: string,
  directory = "common",
): OAuthConfig {
  return {
    authorizationEndpoint: `https://login.microsoftonline.com/${directory}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${directory}/oauth2/v2.0/token`,
    userinfoEndpoint: "https://graph.microsoft.com/oidc/userinfo",
    clientId,
    clientSecret,
    scope: "openid email profile",
  }
}

/** GitLab (SaaS or self-managed via `baseUrl`). */
export function gitlab(
  clientId: string,
  clientSecret: string,
  baseUrl = "https://gitlab.com",
): OAuthConfig {
  const base = baseUrl.replace(/\/$/, "")
  return {
    authorizationEndpoint: `${base}/oauth/authorize`,
    tokenEndpoint: `${base}/oauth/token`,
    userinfoEndpoint: `${base}/oauth/userinfo`,
    clientId,
    clientSecret,
    scope: "openid email profile",
  }
}

export function facebook(clientId: string, clientSecret: string): OAuthConfig {
  return {
    authorizationEndpoint: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenEndpoint: "https://graph.facebook.com/v21.0/oauth/access_token",
    userinfoEndpoint: "https://graph.facebook.com/me?fields=id,name,email",
    clientId,
    clientSecret,
    scope: "email public_profile",
    subjectField: "id",
  }
}

/**
 * Discover ANY standards-compliant OIDC provider's endpoints from its issuer URL
 * (Auth0, Okta, Keycloak, Cognito, Azure, Google, …) — the most generic path: a
 * provider becomes just `{ issuer, clientId, secret }`, no hardcoded endpoints.
 */
export async function oidcDiscovery(
  issuer: string,
  clientId: string,
  clientSecret: string,
): Promise<OAuthConfig> {
  const base = issuer.replace(/\/$/, "")
  const res = await fetch(`${base}/.well-known/openid-configuration`, {
    headers: { accept: "application/json" },
  })
  if (!res.ok) throw new Error(`OIDC discovery failed for ${issuer} (${res.status})`)
  const doc = (await res.json()) as {
    authorization_endpoint: string
    token_endpoint: string
    userinfo_endpoint: string
  }
  return {
    authorizationEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
    userinfoEndpoint: doc.userinfo_endpoint,
    clientId,
    clientSecret,
    scope: "openid email profile",
  }
}

/** Registry of static presets by provider id — for a config UI or one-line
 *  enablement. Providers needing a discovery/network call (oidcDiscovery) or an
 *  extra arg (microsoft directory, self-managed gitlab) are called directly. */
export const oauthPresets = { google, github, microsoft, gitlab, facebook } as const
export type OAuthPresetId = keyof typeof oauthPresets
