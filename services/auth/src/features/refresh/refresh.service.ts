import { hashRefreshToken } from "@iedora/service-runtime";

import {
  findByTokenHash,
  isLive,
  isRotated,
  revokeFamily,
  rotate,
  type Session,
} from "../../data/sessions";
import { findUserById, isBanned, listMemberships } from "../../data/users";
import type { AuthDeps } from "../../deps";
import { unauthorized } from "../../errors";
import { auditWith, buildNextSession, mintTokens, type RequestMeta, type Tokens } from "../../session";

class ReuseError extends Error {}

// burnFamily revokes a session family and records the reuse event atomically —
// the theft signal (ports service.revokeFamily).
async function burnFamily(deps: AuthDeps, cur: Session, meta: RequestMeta): Promise<void> {
  await deps.db.runInTx(async () => {
    await revokeFamily(deps.db.db, cur.family_id);
    await auditWith(deps.auditor, meta).recordSync({
      action: "auth.token.reuse_detected",
      outcome: "failure",
      actor: { type: "user", id: cur.user_id },
      tenantId: cur.tenant_id ?? undefined,
      targetType: "user",
      targetId: cur.user_id,
      meta: { family_id: cur.family_id, session_id: cur.id },
    });
  });
}

// Refresh rotates a refresh token and mints a new access token. Presenting an
// already-rotated token burns the whole family (reuse detection). Ports
// service.Refresh including the rotation/audit-in-one-tx + race handling.
export async function refresh(deps: AuthDeps, refreshToken: string, meta: RequestMeta): Promise<Tokens> {
  const now = new Date();
  const cur = await findByTokenHash(deps.db.db, hashRefreshToken(refreshToken));
  if (!cur) throw unauthorized("session not found");

  if (isRotated(cur)) {
    await burnFamily(deps, cur, meta);
    throw unauthorized("token reused");
  }
  if (!isLive(cur, now)) throw unauthorized("session expired");

  const user = await findUserById(deps.db.db, cur.user_id);
  if (!user || isBanned(user, now)) {
    await revokeFamily(deps.db.db, cur.family_id);
    throw unauthorized();
  }

  const { session: next, token } = buildNextSession(cur, deps.cfg, meta);
  // A session opened before the user had a tenant (register → onboarding) picks
  // up the first membership now, so the post-onboarding refresh is tenant-scoped.
  if (!next.tenantId) {
    const ms = await listMemberships(deps.db.db, cur.user_id);
    next.tenantId = ms[0]?.tenant_id ?? null;
  }

  try {
    await deps.db.runInTx(async () => {
      const { ok, nextId } = await rotate(deps.db.db, cur.id, next);
      if (!ok) throw new ReuseError(); // lost the race → roll back the inserted successor
      await auditWith(deps.auditor, meta).recordSync({
        action: "auth.token.refresh",
        actor: { type: "user", id: user.id },
        tenantId: next.tenantId ?? undefined,
        targetType: "user",
        targetId: user.id,
        meta: { session_id: nextId },
      });
    });
  } catch (err) {
    if (err instanceof ReuseError) {
      await burnFamily(deps, cur, meta);
      throw unauthorized("token reused");
    }
    throw err;
  }

  return mintTokens(deps, user, next.familyId, next.tenantId, token, next.expiresAt);
}
