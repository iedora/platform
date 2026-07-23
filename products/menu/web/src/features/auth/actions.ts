'use server'

import { redirect } from 'next/navigation'
import { logout } from '@iedora/auth-sdk/next'
import { brandUrl, isSameIedoraOrigin } from '@iedora/brand'

/**
 * Auth server actions. Credential exchange (sign-in / sign-up / password reset)
 * lives on the central auth surface (iedora.com); this package only owns the
 * product-local sign-out that revokes the session and clears the SSO cookies.
 */

/** Revokes the session server-side and clears the SSO cookies. */
export async function signOutAction(next?: string): Promise<void> {
  await logout()
  redirect(isSameIedoraOrigin(next) ? next! : brandUrl())
}
