import { changePasswordRequest } from "@iedora/contracts";
import { hashPassword, type UserEnv, userAuth, verifyPassword } from "@iedora/service-runtime";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { listSessionsForUser, revokeFamiliesExcept, revokeFamilyForUser } from "../../data/sessions";
import { findUserById, updatePasswordHash } from "../../data/users";
import type { AuthDeps } from "../../deps";
import { toAdminSession } from "../../dto";
import { auditWith, metaFrom } from "../../session";

// Self-service account security (user-authed): the owner managing THEIR OWN
// account from Settings.
//   POST /auth/change-password         — voluntary OR forced password change
//   GET  /auth/sessions                — my logged-in devices
//   POST /auth/sessions/:family/revoke — sign out one device
//   POST /auth/sessions/revoke-others  — sign out every other device
// DTO mapping lives in src/dto.ts (shared with the admin Users CRM routes).

export function accountRoutes(deps: AuthDeps) {
  const guard = userAuth(deps.userVerifier);
  return new Hono<UserEnv>()
    .post("/change-password", guard, zValidator("json", changePasswordRequest), async (c) => {
      const principal = c.get("user");
      const input = c.req.valid("json");
      const user = await findUserById(deps.db.db, principal.userId);
      if (!user) throw new HTTPException(401, { message: "unauthenticated" });

      // A voluntary change must prove the current password; a FORCED change
      // (the user just authenticated at login) does not re-ask for it.
      if (!user.must_change_password) {
        if (!input.currentPassword) {
          throw new HTTPException(422, { message: "current password is required" });
        }
        if (!(await verifyPassword(user.password_hash, input.currentPassword))) {
          throw new HTTPException(403, { message: "current password is incorrect" });
        }
      }

      const hash = await hashPassword(input.newPassword);
      // Clears must_change_password + stamps password_changed_at.
      await updatePasswordHash(deps.db.db, user.id, hash);
      // A password change signs out every OTHER device, keeping this one.
      if (principal.sessionId) await revokeFamiliesExcept(deps.db.db, user.id, principal.sessionId);

      await auditWith(deps.auditor, metaFrom(c)).recordSync({
        action: "auth.user.password_changed",
        actor: { type: "user", id: user.id },
        targetType: "user",
        targetId: user.id,
        meta: { forced: user.must_change_password },
      });
      return c.json({ ok: true });
    })
    .get("/sessions", guard, async (c) => {
      const now = new Date();
      const sessions = await listSessionsForUser(deps.db.db, c.get("user").userId);
      return c.json({ sessions: sessions.map((s) => toAdminSession(s, now)) });
    })
    .post("/sessions/:family/revoke", guard, async (c) => {
      const ok = await revokeFamilyForUser(deps.db.db, c.get("user").userId, c.req.param("family"));
      if (!ok) throw new HTTPException(404, { message: "no live session for that device" });
      return c.json({ ok: true });
    })
    .post("/sessions/revoke-others", guard, async (c) => {
      const principal = c.get("user");
      if (principal.sessionId) await revokeFamiliesExcept(deps.db.db, principal.userId, principal.sessionId);
      return c.json({ ok: true });
    });
}
