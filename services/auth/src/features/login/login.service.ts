import { hashPassword, verifyPassword } from "@iedora/server-kit";
import { HTTPException } from "hono/http-exception";

import { grantedRole } from "../../config";
import { insertSession } from "../../data/sessions";
import { findUserByEmail, isBanned, listMemberships, setRole } from "../../data/users";
import type { AuthDeps } from "../../deps";
import { unauthorized } from "../../errors";
import { auditWith, buildSession, mintTokens, type RequestMeta, type Tokens } from "../../session";

// A real argon2 hash, verified against on the no-such-user path to equalize
// timing and deny an account-enumeration oracle.
const DUMMY_HASH = await hashPassword("timing-equalizer-placeholder");

// Login verifies credentials and opens a new session family.
export async function login(
  deps: AuthDeps,
  input: { email: string; password: string },
  meta: RequestMeta,
): Promise<Tokens> {
  // Every login emit carries the request's user-agent + ip hash; the recorder
  // stamps them so each call site states only what differs.
  const { record: audit, recordSync: auditSync } = auditWith(deps.auditor, meta);

  const user = await findUserByEmail(deps.db.db, input.email);
  if (!user) {
    await verifyPassword(DUMMY_HASH, input.password).catch(() => false);
    void audit({
      action: "auth.session.login",
      outcome: "failure",
      meta: { email: input.email, reason: "no_user" },
    });
    throw unauthorized();
  }

  if (!(await verifyPassword(user.password_hash, input.password))) {
    void audit({
      action: "auth.session.login",
      outcome: "failure",
      actor: { type: "user", id: user.id },
      meta: { reason: "bad_password" },
    });
    throw unauthorized();
  }

  if (isBanned(user, new Date())) {
    void audit({
      action: "auth.session.login",
      outcome: "failure",
      actor: { type: "user", id: user.id },
      meta: { reason: "banned" },
    });
    throw new HTTPException(403, { message: "account banned" });
  }

  const memberships = await listMemberships(deps.db.db, user.id);
  const tenantId = memberships[0]?.tenant_id ?? null;
  const { session, token } = buildSession(user.id, tenantId, deps.cfg, meta);

  // Role-grant hook: ROLE_GRANTS may assign this identity a role on login
  // (idempotent — only when it differs from the current role). The mutated
  // `user` then flows into mintTokens so the access token carries it at once.
  const role = grantedRole(deps.cfg, user.email);
  const promote = role != null && user.role !== role;

  await deps.db.runInTx(async () => {
    await insertSession(deps.db.db, session);
    if (promote) {
      await setRole(deps.db.db, user.id, role);
      await auditSync({
        action: "auth.user.role_granted",
        actor: { type: "user", id: user.id },
        tenantId: tenantId ?? undefined,
        targetType: "user",
        targetId: user.id,
        meta: { role, reason: "role_grant" },
      });
    }
    await auditSync({
      action: "auth.session.login",
      actor: { type: "user", id: user.id },
      tenantId: tenantId ?? undefined,
      targetType: "user",
      targetId: user.id,
    });
  });
  if (promote) user.role = role;

  return mintTokens(deps, user, session.familyId, tenantId, token, session.expiresAt);
}
