import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { authClient, getAccessToken, getClaims } from '@iedora/auth-sdk/next'

/**
 * Dashboard guard: while the account is flagged for a forced password change,
 * route the user to the change-password screen (which lives OUTSIDE this layout,
 * so no redirect loop).
 *
 * Fast path: the flag rides in the access token's `mcp` claim (JWKS-verified via
 * getClaims), so the COMMON case (not flagged) is decided locally with zero
 * network. Only a token that actually carries the flag pays for the LIVE
 * `whoami` confirmation, which lets the redirect stop the instant the change
 * completes (the claim lags until the next refresh). Fail-open — a transient
 * auth blip never locks a user out.
 */
export const enforcePasswordChange = cache(async (): Promise<void> => {
  const claims = await getClaims()
  // Local short-circuit: no flag claim → nothing to enforce, no network.
  if (!claims?.mcp) return
  const token = await getAccessToken()
  if (!token) return
  let must = false
  try {
    must = (await authClient.whoami(token)).mustChangePassword
  } catch {
    return
  }
  if (must) redirect('/menu/change-password')
})
