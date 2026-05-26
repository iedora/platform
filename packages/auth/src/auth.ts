import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization, admin } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { getCoreDb } from './db'
import { schema } from './schema'
import { ac, roles, iedoraAdmin } from './permissions'

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
  const baseURL = process.env.IEDORA_CORE_BASE_URL
  const secret = process.env.IEDORA_CORE_SECRET
  const trustedOriginsRaw = process.env.IEDORA_CORE_TRUSTED_ORIGINS ?? ''

  if (!baseURL || !secret) {
    throw new Error(
      '[iedora/auth] IEDORA_CORE_BASE_URL and IEDORA_CORE_SECRET must be set.',
    )
  }

  const trustedOrigins = trustedOriginsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return betterAuth({
    baseURL,
    secret,
    trustedOrigins,
    database: drizzleAdapter(getCoreDb(), {
      provider: 'pg',
      schema,
      usePlural: false,
    }),
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
      // `IEDORA_CORE_COOKIE_DOMAIN` in dev (where `.localhost` is invalid).
      crossSubDomainCookies: {
        enabled: true,
        domain: process.env.IEDORA_CORE_COOKIE_DOMAIN ?? '.iedora.com',
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
        // Cross-tenant `iedora-admin` role. Resolves against the wildcard
        // permission set bound in `permissions.ts`.
        adminRoles: ['iedora-admin'],
        roles: { 'iedora-admin': iedoraAdmin },
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
