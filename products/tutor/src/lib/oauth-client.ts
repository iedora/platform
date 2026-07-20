import { oauthAuthorizeUrl as build } from "@iedora/auth-sdk-nextjs/client"

const AUTH_BASE_URL = process.env.NEXT_PUBLIC_AUTH_BASE_URL ?? "http://localhost:4000"
const AUTH_TENANT = process.env.NEXT_PUBLIC_AUTH_TENANT ?? "tutor"

/** Authorize URL for a provider (google, …), returning to our OAuth callback. */
export function oauthAuthorizeUrl(providerId: string): string {
  return build({ baseUrl: AUTH_BASE_URL, tenant: AUTH_TENANT }, providerId, `${window.location.origin}/oauth-callback`)
}
