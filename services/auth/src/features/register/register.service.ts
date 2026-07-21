import { hashPassword } from "@iedora/service-runtime";

import { grantedRole } from "../../config";
import { insertSession } from "../../data/sessions";
import { createUserOr409, setRole } from "../../data/users";
import type { AuthDeps } from "../../deps";
import { auditWith, buildSession, mintTokens, type RequestMeta, type Tokens } from "../../session";

// Register creates a user (+ its audit event, atomically) then auto-logs them in
// with a fresh session.
export async function register(
  deps: AuthDeps,
  input: { email: string; password: string; name: string },
  meta: RequestMeta,
): Promise<Tokens> {
  const passwordHash = await hashPassword(input.password);

  const audit = auditWith(deps.auditor, meta);
  const user = await deps.db.runInTx(async () => {
    const created = await createUserOr409(deps.db.db, {
      email: input.email,
      passwordHash,
      name: input.name,
    });
    await audit.recordSync({
      action: "auth.user.register",
      actor: { type: "user", id: created.id },
      targetType: "user",
      targetId: created.id,
    });
    // Role-grant hook: a registration matching ROLE_GRANTS lands with that role
    // straight away (same resolver + audit event the login hook uses).
    const role = grantedRole(deps.cfg, created.email);
    if (role && created.role !== role) {
      await setRole(deps.db.db, created.id, role);
      await audit.recordSync({
        action: "auth.user.role_granted",
        actor: { type: "user", id: created.id },
        targetType: "user",
        targetId: created.id,
        meta: { role, reason: "role_grant" },
      });
      created.role = role;
    }
    return created;
  });

  // Auto-login: open a session (no audit — the register event is the record). A
  // brand-new user has no tenant yet; the post-onboarding refresh picks one up.
  const { session, token } = buildSession(user.id, null, deps.cfg, meta);
  await insertSession(deps.db.db, session);
  return mintTokens(deps, user, session.familyId, null, token, session.expiresAt);
}
