import { hashRefreshToken } from "@iedora/server-kit";

import { findByTokenHash, revokeAllForUser, revokeFamily } from "../../data/sessions";
import type { AuthDeps } from "../../deps";
import { auditWith, type RequestMeta } from "../../session";

// Logout revokes the family the presented refresh token belongs to (this
// device). Idempotent — an unknown token is already "logged out". Ports
// service.Logout.
export async function logout(deps: AuthDeps, refreshToken: string, meta: RequestMeta): Promise<void> {
  const cur = await findByTokenHash(deps.db.db, hashRefreshToken(refreshToken));
  if (!cur) return;
  await deps.db.runInTx(async () => {
    await revokeFamily(deps.db.db, cur.family_id);
    await auditWith(deps.auditor, meta).recordSync({
      action: "auth.session.logout",
      actor: { type: "user", id: cur.user_id },
      tenantId: cur.tenant_id ?? undefined,
      targetType: "user",
      targetId: cur.user_id,
      meta: { session_id: cur.id },
    });
  });
}

// LogoutAll revokes every session for a user (all devices). Ports service.LogoutAll.
export async function logoutAll(deps: AuthDeps, userId: string, meta: RequestMeta): Promise<void> {
  await deps.db.runInTx(async () => {
    await revokeAllForUser(deps.db.db, userId);
    await auditWith(deps.auditor, meta).recordSync({
      action: "auth.session.logout_all",
      actor: { type: "user", id: userId },
      targetType: "user",
      targetId: userId,
    });
  });
}
