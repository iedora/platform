import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@iedora/auth'
import { signInUrl } from '@iedora/brand'

/**
 * Non-redirecting read of the current better-auth session. Returns
 * `null` when there's no cookie / expired / tampered.
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

/**
 * Cross-tenant guard: caller must be signed in AND carry the
 * `iedora-admin` role on the user row. Bounces unauthenticated callers
 * to `/sign-in`; 404s authenticated-but-not-admin callers (hides the
 * surface).
 */
export async function requireIedoraAdmin() {
  const session = await getSession()
  if (!session?.user) {
    redirect(signInUrl())
  }
  if (session.user.role !== 'iedora-admin') {
    notFound()
  }
  return session
}
