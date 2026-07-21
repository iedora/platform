/** Client-safe (no server imports). Build the auth service's authorize URL for a
 *  provider — generic across providers enabled on the tenant (google, github, …).
 *  Redirects back to the product's OAuth callback, where the fragment tokens are
 *  handed to `actions.completeOAuth`. */
export function oauthAuthorizeUrl(
  opts: { baseUrl: string; tenant: string },
  providerId: string,
  redirectUri: string,
): string {
  const base = opts.baseUrl.replace(/\/$/, "")
  return `${base}/${opts.tenant}/oauth/${providerId}/authorize?redirect=${encodeURIComponent(redirectUri)}`
}
