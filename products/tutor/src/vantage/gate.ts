import type { AuthClaims } from "@iedora/auth-sdk"
import { notFound } from "next/navigation"
import { cache } from "react"

import { authNext } from "@iedora/auth-sdk/next"

// The global super-admin role, minted by the auth service (PLATFORM_ADMINS) and
// carried in the access-token `roles` claim. Vantage gates on THIS — verified
// offline from the JWT — not on tutor's product `isAdmin` bit, so the console's
// access is decoupled from any product's moderator table.
export const PLATFORM_ADMIN = "platform:admin"

/** Whether the current viewer is a platform super-admin. Cached per request. */
export const isSuperAdmin = cache(async (): Promise<boolean> => {
  return (await authNext.getClaims())?.roles?.includes(PLATFORM_ADMIN) ?? false
})

/**
 * Gate a Vantage Server Component. Anyone who is not a platform super-admin —
 * signed out or just not privileged — gets 404, so the console stays invisible
 * rather than advertising itself. Returns the verified claims.
 */
export async function requireSuperAdmin(): Promise<AuthClaims> {
  const claims = await authNext.getClaims()
  if (!claims || !claims.roles?.includes(PLATFORM_ADMIN)) notFound()
  return claims
}
