import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization, admin } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { getCoreDb } from './db'
import { schema } from './schema'
import { ac, roles, iedoraAdmin, iedoraSupport } from './permissions'
import { recordAudit } from './audit'

/**
 * The canonical iedora auth instance. Every product imports this — there
 * is no second configuration anywhere in the estate. Cookies seal on the
 * parent domain (`.iedora.com` in prod, `localhost` in dev) so a session
 * created on one product surface (e.g. core.iedora.com sign-in) is
 * readable by another (menu.iedora.com).
 *
 * Initialisation is LAZY (first call to `getAuth()`), not at import time,
 * so:
 *   - `next build` with an empty env doesn't try to open a database
 *     socket while collecting page data.
 *   - Tests can stub `process.env` before importing anything that touches
 *     `auth.api.*`.
 */
let cached: ReturnType<typeof build> | null = null

function build() {
  const baseURL = process.env.CORE_BASE_URL
  const secret = process.env.CORE_SECRET
  const trustedOriginsRaw = process.env.CORE_TRUSTED_ORIGINS ?? ''
  const bootstrapAdminsRaw = process.env.IEDORA_BOOTSTRAP_ADMIN_EMAILS ?? ''

  if (!baseURL || !secret) {
    throw new Error(
      '[iedora/auth] CORE_BASE_URL and CORE_SECRET must be set.',
    )
  }

  const trustedOrigins = trustedOriginsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // CSV of emails auto-promoted to `iedora-admin` on signup — covers
  // the founding account so the first deploy doesn't need a manual
  // SQL UPDATE. Anything else lands via the admin UI.
  const bootstrapAdminEmails = new Set(
    bootstrapAdminsRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )

  return betterAuth({
    baseURL,
    secret,
    trustedOrigins,
    database: drizzleAdapter(getCoreDb(), {
      provider: 'pg',
      schema,
      usePlural: false,
    }),
    databaseHooks: {
      user: {
        create: {
          // Bootstrap the founding iedora-admin on first signup. Avoids
          // needing a manual SQL UPDATE after the first deploy — the
          // founder's account is auto-promoted to the cross-tenant role
          // as it's created. Idempotent: only fires on row creation.
          before: async (user) => {
            if (bootstrapAdminEmails.has(user.email.toLowerCase())) {
              return { data: { ...user, role: 'iedora-admin' } }
            }
            return { data: user }
          },
          // Audit: every signup. Outcome is always `success` here
          // (better-auth's `before` already validated email +
          // password rules). `bootstrap-admin` lands in meta so the
          // audit trail explicitly records the auto-promotion.
          after: async (user) => {
            const promoted = bootstrapAdminEmails.has(user.email.toLowerCase())
            await recordAudit({
              event: 'user.signed-up',
              outcome: 'success',
              actor: {
                userId: user.id,
                role: (user.role as string | undefined) ?? null,
                email: user.email,
              },
              target: { userId: user.id },
              meta: promoted
                ? { bootstrapAdminPromotion: true }
                : null,
              important: true,
            })
          },
        },
      },
      session: {
        create: {
          // Audit every successful sign-in. better-auth populates IP +
          // user-agent on the session row itself; we read them back
          // and don't have a Headers object to pass through, so the
          // ip_hash falls to `null` on the row — we record the IP
          // directly in `meta` since the session model already stored
          // it server-side (no extra PII exposure).
          after: async (session) => {
            await recordAudit({
              event: 'user.signed-in',
              outcome: 'success',
              actor: { userId: session.userId },
              target: { userId: session.userId, sessionId: session.id },
              meta: {
                ipAddress: session.ipAddress ?? null,
                impersonatedBy: session.impersonatedBy ?? null,
              },
              important: true,
            })
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Email verification is opt-in for now — we don't have SMTP in the
      // estate yet. When SMTP lands, flip to `true` + wire `sendVerificationEmail`.
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 256,
    },
    advanced: {
      // Parent-domain cookie so menu.iedora.com + core.iedora.com + any
      // future iedora.com surface read the same session. Override with
      // `CORE_COOKIE_DOMAIN` in dev (where `.localhost` is invalid).
      crossSubDomainCookies: {
        enabled: true,
        domain: process.env.CORE_COOKIE_DOMAIN ?? '.iedora.com',
      },
    },
    plugins: [
      organization({
        ac,
        roles,
        // No teams today — the org is the smallest tenancy boundary.
        teams: { enabled: false },
        // Members can NOT invite others; only admin/owner can. The
        // permissions object below is consulted by the plugin itself
        // alongside the AC bindings.
        allowUserToCreateOrganization: true,
      }),
      admin({
        ac,
        // Cross-tenant staff roles. Both are recognised by the admin
        // plugin (so its endpoints unlock for either), but our
        // application-level `requireScope` gates the fine-grained
        // verbs — `iedora-support` cannot reach `users:set-role` /
        // `users:impersonate`, the AC binding refuses.
        adminRoles: ['iedora-admin', 'iedora-support'],
        roles: {
          'iedora-admin': iedoraAdmin,
          'iedora-support': iedoraSupport,
        },
      }),
      // `nextCookies()` MUST be the last plugin — it patches the response
      // pipeline to ship Set-Cookie headers through Next's server-action
      // boundary correctly.
      nextCookies(),
    ],
  })
}

export function getAuth() {
  if (!cached) cached = build()
  return cached
}

export type Auth = ReturnType<typeof build>
export type AuthSession = Awaited<ReturnType<Auth['api']['getSession']>>

/**
 * Lazy singleton — same instance every product binds to. `getAuth()`
 * is preserved for callers that want the resolved object directly;
 * `auth` is a Proxy that intercepts every access so `next build`
 * collecting page data on an empty env doesn't open a Postgres socket
 * just to satisfy a top-level `import { auth } from '@iedora/auth'`.
 */
export const auth: Auth = new Proxy({} as Auth, {
  get: (_t, key) => Reflect.get(getAuth(), key),
})
