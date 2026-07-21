import { adminSetPasswordRequest, type AdminUserDetail } from "@iedora/contracts";
import { hashPassword, type ServiceEnv, serviceAuth } from "@iedora/service-runtime";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { listSessionsForUser, revokeAllForUser, revokeFamilyForUser } from "../../data/sessions";
import {
  type AdminUserRow,
  findUserById,
  listMemberships,
  listUsers,
  setMustChangePassword,
  updatePasswordHash,
} from "../../data/users";
import type { AuthDeps } from "../../deps";
import { toAdminSession, toAdminUser } from "../../dto";

// Service-only user administration for the menu BFF's staff "Users" CRM (read
// only):
//   GET /auth/admin/users           — search/list users (newest first)
//   GET /auth/admin/users/:id        — one user + tenant memberships
//   GET /auth/admin/users/:id/sessions — that user's sessions (device history)
// Gated by serviceAuth — the menu service presents a service token. The audit
// timeline (everything the user DID) is read separately from the audit service.
// DTO mapping lives in src/dto.ts (shared with the self-service account routes).

export function usersAdminRoutes(deps: AuthDeps) {
  const guard = serviceAuth(deps.serviceVerifier);
  return new Hono<ServiceEnv>()
    .get("/admin/users", guard, async (c) => {
      const q = c.req.query("q") ?? undefined;
      const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
      const rows: AdminUserRow[] = await listUsers(deps.db.db, { q, limit });
      return c.json({ users: rows.map((r) => toAdminUser(r, Number(r.tenant_count))) });
    })
    .get("/admin/users/:id", guard, async (c) => {
      const id = c.req.param("id");
      const user = await findUserById(deps.db.db, id);
      if (!user) throw new HTTPException(404, { message: "user not found" });
      const memberships = await listMemberships(deps.db.db, id);
      const detail: AdminUserDetail = {
        ...toAdminUser(user, memberships.length),
        memberships: memberships.map((m) => ({ tenantId: m.tenant_id, role: m.role })),
      };
      return c.json(detail);
    })
    .get("/admin/users/:id/sessions", guard, async (c) => {
      const id = c.req.param("id");
      if (!(await findUserById(deps.db.db, id))) {
        throw new HTTPException(404, { message: "user not found" });
      }
      const now = new Date();
      const sessions = await listSessionsForUser(deps.db.db, id);
      return c.json({ sessions: sessions.map((s) => toAdminSession(s, now)) });
    })
    // --- write actions (the audit trail is emitted by the menu BFF with the
    // acting staff member as the actor; these just mutate). ---
    // Force a password change at next login. Also revokes the user's live
    // sessions so they must re-authenticate (and get routed through the
    // change-password screen).
    .post("/admin/users/:id/force-password-change", guard, async (c) => {
      const id = c.req.param("id");
      if (!(await findUserById(deps.db.db, id))) throw new HTTPException(404, { message: "user not found" });
      await setMustChangePassword(deps.db.db, id, true);
      await revokeAllForUser(deps.db.db, id);
      return c.json({ ok: true });
    })
    // Set a temporary password the user must change at next login. Sessions are
    // revoked so the temporary password is what they sign in with.
    .post("/admin/users/:id/set-password", guard, zValidator("json", adminSetPasswordRequest), async (c) => {
      const id = c.req.param("id");
      if (!(await findUserById(deps.db.db, id))) throw new HTTPException(404, { message: "user not found" });
      const hash = await hashPassword(c.req.valid("json").password);
      await updatePasswordHash(deps.db.db, id, hash, { forceChange: true });
      await revokeAllForUser(deps.db.db, id);
      return c.json({ ok: true });
    })
    // Kick one device (session family). 404 if the family isn't a live session
    // of this user.
    .post("/admin/users/:id/sessions/:family/revoke", guard, async (c) => {
      const id = c.req.param("id");
      const family = c.req.param("family");
      const revoked = await revokeFamilyForUser(deps.db.db, id, family);
      if (!revoked) throw new HTTPException(404, { message: "no live session for that device" });
      return c.json({ ok: true });
    });
}
