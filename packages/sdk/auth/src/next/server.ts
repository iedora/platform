import { type AuthClaims, type AuthSession, createAuthClient, createAuthVerifier } from "../index.ts"
import { cookies } from "next/headers"

import {
  type AuthNextConfig,
  cookieNames,
  cookieOptions,
  DEFAULT_ACCESS_MAX_AGE,
  DEFAULT_REFRESH_MAX_AGE,
} from "./config.ts"

export type AuthResult = { error?: { message: string } }

/** After a successful sign-in (any provider), the product ensures its own domain
 *  profile for the user — the one product-specific hook. */
export type OnAuthenticated = (user: {
  id: string
  email: string
  name?: string | null
}) => Promise<void>

function message(e: unknown): string {
  const m = (e as { message?: string })?.message
  return m && m.length < 200 ? m : "Something went wrong. Please try again."
}

/**
 * The whole Next.js server integration for one product, from config. Provides
 * the httpOnly cookie session, JWKS verification, and register/login/logout/OAuth
 * logic. The product wraps the returned `actions` in its own "use server" module
 * and builds its viewer/session model on `getClaims()`.
 */
export function createAuthNext(config: AuthNextConfig, hooks: { onAuthenticated?: OnAuthenticated } = {}) {
  const client = createAuthClient({ baseUrl: config.baseUrl, tenant: config.tenant })
  const verify = createAuthVerifier({ issuer: config.baseUrl, audience: config.audience })
  const names = cookieNames(config.cookiePrefix)
  const opts = cookieOptions(config)
  const accessMaxAge = config.accessMaxAge ?? DEFAULT_ACCESS_MAX_AGE
  const refreshMaxAge = config.refreshMaxAge ?? DEFAULT_REFRESH_MAX_AGE

  async function setSession(accessToken: string, refreshToken: string): Promise<void> {
    const jar = await cookies()
    jar.set(names.access, accessToken, { ...opts, maxAge: accessMaxAge })
    jar.set(names.refresh, refreshToken, { ...opts, maxAge: refreshMaxAge })
  }
  async function clearSession(): Promise<void> {
    const jar = await cookies()
    jar.delete(names.access)
    jar.delete(names.refresh)
  }
  async function readAccess(): Promise<string | undefined> {
    return (await cookies()).get(names.access)?.value
  }
  async function readRefresh(): Promise<string | undefined> {
    return (await cookies()).get(names.refresh)?.value
  }

  /** The verified claims of the current session, or null. The product builds its
   *  own viewer (roles, profile) on top of these. */
  async function getClaims(): Promise<AuthClaims | null> {
    const access = await readAccess()
    if (!access) return null
    try {
      return await verify(access)
    } catch {
      return null // middleware refreshes; if still invalid, signed-out
    }
  }

  async function afterAuth(session: AuthSession): Promise<void> {
    await setSession(session.accessToken, session.refreshToken)
    await hooks.onAuthenticated?.(session.user)
  }

  return {
    client,
    verify,
    names,
    setSession,
    clearSession,
    readAccess,
    readRefresh,
    getClaims,

    /** register/login/logout/OAuth — the product re-exports these from a
     *  "use server" module. */
    actions: {
      async login(input: { email: string; password: string }): Promise<AuthResult> {
        try {
          await afterAuth(await client.login(input))
          return {}
        } catch (e) {
          return { error: { message: message(e) } }
        }
      },
      async register(input: {
        email: string
        password: string
        name?: string
      }): Promise<AuthResult> {
        try {
          await afterAuth(await client.register(input))
          return {}
        } catch (e) {
          return { error: { message: message(e) } }
        }
      },
      async logout(): Promise<void> {
        const refresh = await readRefresh()
        if (refresh) {
          try {
            await client.logout(refresh)
          } catch {
            // best-effort revoke; clear cookies regardless
          }
        }
        await clearSession()
      },
      /** Complete an OAuth sign-in: tokens arrived via the callback URL fragment;
       *  VERIFY the access token before trusting it, then set the session. */
      async completeOAuth(accessToken: string, refreshToken: string): Promise<AuthResult> {
        try {
          const claims = await verify(accessToken)
          await setSession(accessToken, refreshToken)
          await hooks.onAuthenticated?.({
            id: claims.sub,
            email: claims.email ?? `${claims.sub}@oauth.local`,
            name: claims.name ?? null,
          })
          return {}
        } catch {
          return { error: { message: "Sign-in failed. Please try again." } }
        }
      },
    },
  }
}

export type AuthNext = ReturnType<typeof createAuthNext>
export type { AuthNextConfig } from "./config.ts"
