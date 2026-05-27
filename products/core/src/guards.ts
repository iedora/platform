import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth, recordAudit } from '@iedora/auth'
import { hasStaffScope } from '@iedora/auth/permissions'
import { signInUrl } from './url'
import { type Scope } from '@iedora/auth/scopes'

/**
 * Non-redirecting read of the current better-auth session. Returns
 * `null` when there's no cookie / expired / tampered.
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

/**
 * Capture a denied authz attempt to the audit log. Important=false —
 * the timeline is dominated by successes; denials are filterable
 * separately (probes + accidental clicks generate lots of these).
 */
async function recordDenied(input: {
  reason: 'no-session' | 'no-scope'
  scope: string
  session?: Awaited<ReturnType<typeof getSession>>
  h: Headers
}): Promise<void> {
  await recordAudit({
    event: 'auth.denied',
    outcome: 'denied',
    actor: input.session?.user
      ? {
          userId: input.session.user.id,
          role: input.session.user.role ?? null,
          email: input.session.user.email,
        }
      : null,
    headers: input.h,
    meta: { reason: input.reason, scope: input.scope },
    important: false,
  })
}

/**
 * Non-throwing scope probe. Returns true iff the current caller has
 * the requested scope. Use to conditionally render UI (a button, a
 * nav link) that would otherwise 404 on click via `requireScope`.
 * Never throws — anonymous, tenant, and unknown-role callers all
 * return false.
 *
 * Positive semantics: render IF the scope is held. Do not invert.
 * Surfaces are hidden by absence, not by explicit deny.
 *
 * Thin wrapper over `hasStaffScope` (`@iedora/auth/permissions`) —
 * the AC eval lives in one place; this file adds the Next session
 * read on top.
 */
export async function hasScope(scope: Scope): Promise<boolean> {
  const session = await getSession()
  return hasStaffScope(session?.user?.role, scope)
}

/**
 * Capability-based guard. Two failure modes:
 *
 *   - no session                → redirect to /sign-in (anonymous).
 *   - missing scope (any reason — tenant role, non-staff, role
 *     without this scope) → `notFound()`. We hide the existence of
 *     the surface; a 403 would advertise it.
 *
 * Successful + denied attempts both land in the audit log
 * (`auth.denied`, `important: false`) so probes + accidental clicks
 * stay filterable separately from real activity.
 */
export async function requireScope(scope: Scope) {
  const h = await headers()
  const session = await getSession()
  if (!session?.user) {
    await recordDenied({ reason: 'no-session', scope, h })
    redirect(signInUrl())
  }
  if (!(await hasStaffScope(session.user.role, scope))) {
    await recordDenied({ reason: 'no-scope', scope, session, h })
    notFound()
  }
  return session
}
