/**
 * Server-to-server calls against the auth service — now the @iedora/auth-sdk
 * client for the standard surface (login/register/refresh/logout/whoami/
 * password), plus a few thin menu-specific calls (tenants, my-sessions) that the
 * shared client doesn't model. Menu's auth service is mounted at /auth, so the
 * client's tenant is "auth" → it hits `${AUTH_URL}/auth/*`.
 */
import { AuthError, createAuthClient } from '@iedora/auth-sdk'
import type { AuthSession, TokenBundle } from '@iedora/auth-sdk'
import type { AdminUserSession } from '@iedora/contracts'

import { AUTH_URL } from './config'
import { ApiError } from './error'

const client = createAuthClient({
  baseUrl: AUTH_URL,
  tenant: 'auth',
  // BFF calls are never cached; auth responses are per-request.
  fetch: ((url, init) => fetch(url, { ...init, cache: "no-store" })) as typeof fetch,
})

/** Run a client call, mapping the sdk's AuthError to menu's ApiError so callers
 *  keep catching one error type. */
async function wrap<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    if (e instanceof AuthError) throw new ApiError(e.status, e.message)
    throw e
  }
}

export function login(email: string, password: string): Promise<AuthSession> {
  return wrap(client.login({ email, password }))
}

export function register(email: string, password: string, name: string): Promise<AuthSession> {
  return wrap(client.register({ email, password, name }))
}

/**
 * Rotates the refresh token. Returns null when the token is dead
 * (expired / revoked / reused) — callers clear cookies and re-auth.
 */
export async function refreshTokens(refreshToken: string): Promise<TokenBundle | null> {
  try {
    return await client.refresh(refreshToken)
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) return null
    throw e
  }
}

/** Revokes the session family; idempotent server-side. */
export function logout(refreshToken: string): Promise<void> {
  return wrap(client.logout(refreshToken)).then(() => {})
}

/** Requests a password-reset email. Always resolves (never reveals the email). */
export function forgotPassword(email: string): Promise<void> {
  return wrap(client.forgotPassword(email)).then(() => {})
}

/** Completes a reset with the emailed token. */
export function resetPassword(token: string, password: string): Promise<void> {
  return wrap(client.resetPassword(token, password)).then(() => {})
}

/** The signed-in user's identity incl. the LIVE force-change flag (DB-read). */
export async function whoami(accessToken: string): Promise<{ mustChangePassword: boolean }> {
  const w = await wrap(client.whoami(accessToken))
  return { mustChangePassword: w.mustChangePassword }
}

/** Change the signed-in user's password. `currentPassword` is required for a
 *  voluntary change but omitted for a forced one. Throws ApiError on 403/422. */
export function changePassword(
  accessToken: string,
  input: { currentPassword?: string; newPassword: string },
): Promise<void> {
  return wrap(client.changePassword(accessToken, input)).then(() => {})
}

/* ---- menu-specific (not in the auth-sdk standard surface) ---- */

const authFetch = async <T>(path: string, init: RequestInit & { accessToken: string }): Promise<T> => {
  const { accessToken, ...rest } = init
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...rest,
    cache: 'no-store',
    headers: { ...rest.headers, authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return (res.status === 204 ? undefined : await res.json()) as T
}

/**
 * Provisions a tenant owned by the authenticated user. The caller must refresh
 * afterwards so the access token picks up the new org. Menu's own endpoint —
 * auth-sdk's createOrganization models a different (member/role) surface.
 */
export function createTenant(accessToken: string, name: string): Promise<{ tenantId: string }> {
  return authFetch('/auth/tenants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
    accessToken,
  })
}

/** The signed-in user's own devices (sessions). Menu's AdminUserSession shape
 *  (shared with the admin CRM), not auth-sdk's SessionView. */
export async function mySessions(accessToken: string): Promise<AdminUserSession[]> {
  const body = await authFetch<{ sessions: AdminUserSession[] }>('/auth/sessions', { accessToken })
  return body.sessions
}

/** Sign out one of my devices (session family), or all the others (`'*'`). */
export function revokeMyDevice(accessToken: string, family: string): Promise<void> {
  const path =
    family === '*'
      ? '/auth/sessions/revoke-others'
      : `/auth/sessions/${encodeURIComponent(family)}/revoke`
  return authFetch(path, { method: 'POST', accessToken })
}
