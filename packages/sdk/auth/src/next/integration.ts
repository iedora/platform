import { cookies } from "next/headers"

import { type AuthClaims, createAuthClient } from "../index"
import { type AuthNextConfig, cookieNames } from "./config"
import { type AuthResult, createAuthNext } from "./server"

// ── THE centralized auth integration ─────────────────────────────────────────
// Every product (menu, tutor, house) imports the session + operations from HERE —
// no product re-runs createAuthNext, no per-product config. One shared realm:
// tenant "iedora", audience "iedora"; AUTH_COOKIE_DOMAIN (".iedora.com" in prod)
// puts the session cookie on the shared parent domain so one sign-in is SSO
// everywhere. Unset in dev = host-only cookie on localhost.
export const authConfig: AuthNextConfig = {
  baseUrl: process.env.AUTH_BASE_URL ?? "http://localhost:4000",
  tenant: process.env.AUTH_TENANT ?? "iedora",
  audience: process.env.AUTH_AUDIENCE ?? "iedora",
  cookiePrefix: "iedora",
  cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
}

/** authNext owns the httpOnly cookie session + JWKS verify + register/login/logout.
 *  authClient covers the rest (forgot/reset password, sessions, organizations). */
export const authNext = createAuthNext(authConfig)
export const authClient = createAuthClient({
  baseUrl: authConfig.baseUrl,
  tenant: authConfig.tenant,
})

/** The shared, JWKS-verified account. Products layer their own product-data viewer
 *  on top (tutor's student/tutor profile, menu's active restaurant). `org` is the
 *  caller's active organization claim. */
export type Account = {
  userId: string
  email?: string
  name?: string
  roles: string[]
  org?: string
}

function toAccount(c: AuthClaims | null): Account | null {
  if (!c) return null
  return {
    userId: c.sub,
    email: c.email,
    name: c.name ?? undefined,
    roles: c.roles ?? [],
    org: c.org ?? undefined,
  }
}

/** Non-throwing, JWKS-verified read of the signed-in account (null = signed out). */
export async function getAccount(): Promise<Account | null> {
  return toAccount(await authNext.getClaims())
}

/** Raw verified claims, for products needing fields beyond Account. */
export async function getClaims(): Promise<AuthClaims | null> {
  return authNext.getClaims()
}

/** The current access token from the SSO cookie (for a live authClient call like
 *  whoami). Prefer getAccount/getClaims — this is for the rare live-check path. */
export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(cookieNames(authConfig.cookiePrefix).access)?.value
}

// ── Operations — products wrap these in their own forms/actions ──────────────
export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  return authNext.actions.login(input)
}
export async function register(input: {
  email: string
  password: string
  name?: string
}): Promise<AuthResult> {
  return authNext.actions.register(input)
}
export async function logout(): Promise<void> {
  return authNext.actions.logout()
}
export async function completeOAuth(access: string, refresh: string): Promise<AuthResult> {
  return authNext.actions.completeOAuth(access, refresh)
}
/** Kick off a password-reset email (never reveals whether the address exists). */
export async function forgotPassword(email: string): Promise<void> {
  await authClient.forgotPassword(email)
}
/** Set a new password from an emailed reset token. Throws AuthError on a bad token. */
export async function resetPassword(token: string, password: string): Promise<void> {
  await authClient.resetPassword(token, password)
}
