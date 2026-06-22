import type { KeyObject } from "node:crypto";

import { createMiddleware } from "hono/factory";
import { type CryptoKey, jwtVerify } from "jose";

// Verifies USER access tokens (EdDSA). Used by product services (menu, admin)
// and auth's own authenticated routes. Algorithm pinned; iss/aud checked; the
// typ=="access" guard rejects refresh/service tokens.

export interface UserPrincipal {
  userId: string;
  tenantId?: string;
  roles: string[];
  email?: string;
}

export interface UserVerifier {
  key: CryptoKey | Uint8Array | KeyObject;
  issuer: string;
  audience: string;
}

export interface UserEnv {
  Variables: { user: UserPrincipal };
}

export function newUserVerifier(
  key: CryptoKey | Uint8Array | KeyObject,
  issuer: string,
  audience: string,
): UserVerifier {
  return { key, issuer, audience };
}

// Per-process cache of verified tokens, keyed by the raw token, valid until the
// token's own `exp`. Access tokens are short-lived stateless JWTs, so caching to
// expiry matches the token's own validity window and skips the EdDSA verify (+
// payload allocation) on every chatty dashboard request. Capped to bound memory.
const tokenCache = new Map<string, { principal: UserPrincipal; expMs: number }>();
const TOKEN_CACHE_MAX = 1000;

export async function verifyAccessToken(v: UserVerifier, token: string): Promise<UserPrincipal> {
  const cached = tokenCache.get(token);
  if (cached && Date.now() < cached.expMs) return cached.principal;

  const { payload } = await jwtVerify(token, v.key, {
    issuer: v.issuer,
    audience: v.audience,
    algorithms: ["EdDSA"],
  });
  if (payload.typ !== "access") throw new Error("not an access token");
  if (!payload.sub) throw new Error("access token missing subject");
  const principal: UserPrincipal = {
    userId: payload.sub,
    tenantId: typeof payload.tid === "string" ? payload.tid : undefined,
    roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
    email: typeof payload.email === "string" ? payload.email : undefined,
  };

  const expMs = typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  if (expMs > Date.now()) {
    if (tokenCache.size >= TOKEN_CACHE_MAX) {
      const oldest = tokenCache.keys().next().value; // Map keeps insertion order → evict oldest
      if (oldest !== undefined) tokenCache.delete(oldest);
    }
    tokenCache.set(token, { principal, expMs });
  }
  return principal;
}

/** Hono middleware: 401 unless a valid user access token is present; sets `user`. */
export function userAuth(v: UserVerifier) {
  return createMiddleware<UserEnv>(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return c.json({ error: "missing bearer token" }, 401);
    try {
      c.set("user", await verifyAccessToken(v, token));
    } catch {
      return c.json({ error: "invalid access token" }, 401);
    }
    await next();
  });
}

/** True if the principal carries one of the required roles (port of authz checks). */
export function hasRole(p: UserPrincipal, ...roles: string[]): boolean {
  return p.roles.some((r) => roles.includes(r));
}
