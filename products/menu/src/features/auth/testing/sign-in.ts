import 'server-only'
import { randomBytes } from 'node:crypto'
import type { BrowserContext } from '@playwright/test'
import { testDb } from '@/shared/testing/e2e-db'
import { makeSessionCookie, SESSION_COOKIE, SESSION_TTL_SECONDS } from '../adapters/session'
import type { PermissionProfile } from './profile'

/**
 * Mirrors `/api/auth/callback` for tests: inserts a `menu.session` row,
 * seals an opaque pointer cookie ({sid, sub, exp}) with the same JWE
 * adapter as production, and injects it into a Playwright context.
 *
 * This is the auth-slice equivalent of what the OIDC callback does after
 * a successful Zitadel code-exchange — cookie format and table shape must
 * stay in lockstep with the real callback, which is why the helper lives
 * inside the slice (not in `tests/e2e/helpers`).
 *
 * Specs supply the `PermissionProfile` explicitly: there is no implicit
 * "admin" — every test states its scope intent, and `../scopes.ts` is
 * the single source of truth for the strings.
 */

const TEST_SECRET_FALLBACK =
  'test-secret-do-not-use-in-prod-test-secret-do-not-use-in-prod'

export type SignedInUser = {
  userId: string
  email: string
  name: string
  sessionId: string
  organizationId: string
}

export type SignInInput = {
  email: string
  name: string
  /** Permission profile — declared by the test. */
  profile: PermissionProfile
  /**
   * Org id the user belongs to. Defaults to the Zitadel-shim's `o1`.
   * To exercise multi-tenant behaviour the spec should register the
   * user→org mapping with the shim first via
   * `@/features/identity/testing` and pass the same id here.
   */
  organizationId?: string
  /** Custom expiry. Defaults to {@link SESSION_TTL_SECONDS} from now. */
  expiresAt?: Date
  /** Override the JWE secret. Defaults to MENU_SESSION_SECRET env. */
  secret?: string
}

export async function signInAs(
  context: BrowserContext,
  input: SignInInput,
): Promise<SignedInUser> {
  const userId = `usr_${randomBytes(12).toString('hex')}`
  const sessionId = randomBytes(24).toString('base64url')
  const organizationId = input.organizationId ?? 'o1'
  const secret = input.secret ?? process.env.MENU_SESSION_SECRET ?? TEST_SECRET_FALLBACK
  const expiresAt = input.expiresAt ?? new Date(Date.now() + SESSION_TTL_SECONDS * 1000)

  const sql = testDb()
  await sql`
    INSERT INTO "menu"."session" (
      id, user_id, email, name, roles, permissions,
      permissions_version, created_at, last_seen_at, expires_at
    ) VALUES (
      ${sessionId},
      ${userId},
      ${input.email},
      ${input.name},
      ${JSON.stringify([...input.profile.roles])}::jsonb,
      ${JSON.stringify([...input.profile.permissions])}::jsonb,
      1, now(), now(), ${expiresAt}
    )
  `

  const sessions = makeSessionCookie(secret)
  const jwe = await sessions.seal({
    sid: sessionId,
    sub: userId,
    exp: Math.floor(expiresAt.getTime() / 1000),
  })

  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: jwe,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      expires: Math.floor(expiresAt.getTime() / 1000),
    },
  ])

  return { userId, email: input.email, name: input.name, sessionId, organizationId }
}

/** Drop the session cookie. Use to assert post-logout behaviour. */
export async function signOut(context: BrowserContext): Promise<void> {
  await context.clearCookies({ name: SESSION_COOKIE })
}
