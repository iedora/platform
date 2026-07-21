import type { KeyObject } from "node:crypto"

import { jwtVerify } from "jose"

import { typedBearer } from "./bearer"

// Verify USER access tokens (EdDSA). Algorithm pinned; iss/aud checked; the
// typ=="access" guard rejects refresh/service tokens.

export interface UserPrincipal {
  userId: string
  /** Product slug (the `tenant` claim). */
  tenant?: string
  /** Active organization id (the `org` claim). */
  org?: string
  roles: string[]
  email?: string
  /** Session family id (`sid`) — identifies the current device. */
  sessionId?: string
}

export interface UserVerifier {
  key: CryptoKey | Uint8Array | KeyObject
  issuer: string
  audience: string
}

export interface UserEnv {
  Variables: { user: UserPrincipal }
}

export function newUserVerifier(
  key: CryptoKey | Uint8Array | KeyObject,
  issuer: string,
  audience: string,
): UserVerifier {
  return { key, issuer, audience }
}

// Per-process cache of verified tokens, keyed by the raw token, valid until the
// token's own `exp` — skips the EdDSA verify on every chatty request. Capped.
const tokenCache = new Map<string, { principal: UserPrincipal; expMs: number }>()
const TOKEN_CACHE_MAX = 1000

export async function verifyAccessToken(v: UserVerifier, token: string): Promise<UserPrincipal> {
  const cached = tokenCache.get(token)
  if (cached && Date.now() < cached.expMs) return cached.principal

  const { payload } = await jwtVerify(token, v.key, {
    issuer: v.issuer,
    audience: v.audience,
    algorithms: ["EdDSA"],
  })
  if (payload.typ !== "access") throw new Error("not an access token")
  if (!payload.sub) throw new Error("access token missing subject")
  const principal: UserPrincipal = {
    userId: payload.sub,
    tenant: typeof payload.tenant === "string" ? payload.tenant : undefined,
    org: typeof payload.org === "string" ? payload.org : undefined,
    roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
    email: typeof payload.email === "string" ? payload.email : undefined,
    sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
  }

  const expMs = typeof payload.exp === "number" ? payload.exp * 1000 : 0
  if (expMs > Date.now()) {
    if (tokenCache.size >= TOKEN_CACHE_MAX) {
      const oldest = tokenCache.keys().next().value // insertion order → evict oldest
      if (oldest !== undefined) tokenCache.delete(oldest)
    }
    tokenCache.set(token, { principal, expMs })
  }
  return principal
}

/** Hono middleware: 401 unless a valid user access token is present; sets `user`. */
export function userAuth(v: UserVerifier) {
  return typedBearer<UserEnv>({
    verify: (token) => verifyAccessToken(v, token),
    setKey: "user",
    invalidMsg: "invalid access token",
  })
}

/** True if the principal carries one of the required roles. */
export function hasRole(p: UserPrincipal, ...roles: string[]): boolean {
  return p.roles.some((r) => roles.includes(r))
}
