import { randomUUID } from "node:crypto";

import { type AuditEvent, type Auditor, newRefreshToken } from "@iedora/server-kit";
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

import type { AuthConfig } from "./config";
import type { NewSession, Session } from "./data/sessions";
import type { User } from "./data/users";
import type { AuthDeps } from "./deps";

export interface RequestMeta {
  userAgent: string | null;
  /** The raw client IP, kept for the admin security view. Null when no
   *  forwarded IP is present. */
  ip: string | null;
}

/** Client context recorded with sessions + audit events: the raw IP + user
 *  agent (for the admin Users CRM). */
export function metaFrom(c: Context): RequestMeta {
  const ua = c.req.header("user-agent") ?? null;
  const xff = c.req.header("x-forwarded-for");
  const ip = xff ? (xff.split(",")[0]?.trim() ?? "") : "";
  return {
    userAgent: ua,
    ip: ip || null,
  };
}

/**
 * A request-scoped auditor that stamps every event with the request's
 * user-agent + raw IP, so each call site states only what differs
 * (action/outcome/actor/meta) and no auth flow can forget that context. Build
 * one per request from its {@link RequestMeta}.
 */
export function auditWith(auditor: Auditor, meta: RequestMeta) {
  const userAgent = meta.userAgent ?? undefined;
  const ip = meta.ip ?? undefined;
  return {
    record: (e: AuditEvent) => auditor.record({ userAgent, ip, ...e }),
    recordSync: (e: AuditEvent) => auditor.recordSync({ userAgent, ip, ...e }),
  };
}

export interface Tokens {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  userId: string;
  tenantId: string;
  /** True when the account is flagged for a forced password change — the client
   *  routes the user to the change-password screen after this sign-in. */
  mustChangePassword: boolean;
}

/** A fresh session family + its opaque refresh token (not yet persisted). */
export function buildSession(
  userId: string,
  tenantId: string | null,
  cfg: AuthConfig,
  meta: RequestMeta,
): { session: NewSession; token: string } {
  const now = new Date();
  const { token, hash } = newRefreshToken();
  return {
    token,
    session: {
      familyId: randomUUID(),
      userId,
      tenantId,
      tokenHash: hash,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + cfg.refreshTtlMs),
      absoluteExpiresAt: new Date(now.getTime() + cfg.refreshAbsoluteTtlMs),
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  };
}

/** The successor session in a rotation (same family, sliding expiry capped by absolute). */
export function buildNextSession(
  cur: Session,
  cfg: AuthConfig,
  meta: RequestMeta,
): { session: NewSession; token: string } {
  const now = new Date();
  const { token, hash } = newRefreshToken();
  const abs = new Date(cur.absolute_expires_at);
  let exp = new Date(now.getTime() + cfg.refreshTtlMs);
  if (exp > abs) exp = abs;
  return {
    token,
    session: {
      familyId: cur.family_id,
      userId: cur.user_id,
      tenantId: cur.tenant_id,
      tokenHash: hash,
      issuedAt: now,
      expiresAt: exp,
      absoluteExpiresAt: abs,
      userAgent: meta.userAgent,
      ip: meta.ip,
    },
  };
}

/** Mints the access JWT for a persisted session + assembles the Tokens result. */
export async function mintTokens(
  deps: AuthDeps,
  user: User,
  familyId: string,
  tenantId: string | null,
  refreshToken: string,
  refreshExpiresAt: Date,
): Promise<Tokens> {
  const accessToken = await deps.issuer.issueAccess({
    userId: user.id,
    email: user.email,
    tenantId: tenantId ?? undefined,
    sessionId: familyId,
    roles: user.role ? [user.role] : [],
    mustChangePassword: user.must_change_password,
  });
  return {
    accessToken,
    accessExpiresAt: new Date(Date.now() + deps.cfg.accessTtlMs),
    refreshToken,
    refreshExpiresAt,
    userId: user.id,
    tenantId: tenantId ?? "",
    mustChangePassword: user.must_change_password,
  };
}

/** The JSON body returned by token-minting endpoints (matches @iedora/contracts tokenResponse). */
export function tokenJson(t: Tokens): {
  accessToken: string;
  expiresAt: string;
  userId: string;
  tenantId?: string;
  mustChangePassword?: boolean;
} {
  return {
    accessToken: t.accessToken,
    expiresAt: t.accessExpiresAt.toISOString(),
    userId: t.userId,
    ...(t.tenantId ? { tenantId: t.tenantId } : {}),
    ...(t.mustChangePassword ? { mustChangePassword: true } : {}),
  };
}

export function setRefreshCookie(c: Context, cfg: AuthConfig, token: string, expires: Date): void {
  setCookie(c, cfg.refreshCookieName, token, {
    path: "/auth",
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: "Lax",
    domain: cfg.cookieDomain || undefined,
    expires,
  });
}

export function clearRefreshCookie(c: Context, cfg: AuthConfig): void {
  deleteCookie(c, cfg.refreshCookieName, { path: "/auth", domain: cfg.cookieDomain || undefined });
}
