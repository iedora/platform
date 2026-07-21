import { hashPassword, hashRefreshToken, newRefreshToken } from "@iedora/service-runtime";
import { HTTPException } from "hono/http-exception";

import {
  claimToken,
  findActiveByHash,
  hasRecentToken,
  insertResetToken,
  invalidateUserTokens,
} from "../../data/passwordResets";
import { revokeAllForUser } from "../../data/sessions";
import { findUserByEmail, findUserById, isBanned, updatePasswordHash } from "../../data/users";
import type { AuthDeps } from "../../deps";
import { auditWith, type RequestMeta } from "../../session";

// Builds the emailed reset link from configured base + the raw token. The base
// comes from cfg (never the request Host header) → no reset-link poisoning.
function resetLink(base: string, token: string): string {
  const url = new URL(base);
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Forgot-password: issues a one-time reset token and hands the link to the
 * mailer. ALWAYS resolves the same way whether or not the account exists — the
 * caller returns one fixed 200, so there is no account-enumeration oracle. No
 * change is made to the account here (OWASP: don't lock/alter on request).
 */
export async function requestReset(
  deps: AuthDeps,
  email: string,
  meta: RequestMeta,
): Promise<void> {
  const user = await findUserByEmail(deps.db.db, email);
  // Silently no-op for unknown or banned accounts (same external response).
  if (!user || isBanned(user, new Date())) return;

  // Anti-flood: at most one live token per account per throttle window.
  if (await hasRecentToken(deps.db.db, user.id, deps.cfg.resetThrottleMs)) return;

  const { token, hash } = newRefreshToken(); // opaque 32-byte token; only its hash is stored
  const expiresAt = new Date(Date.now() + deps.cfg.resetTokenTtlMs);

  // One transaction does everything at once: store the token, record the audit
  // event, AND enqueue the email into the Postgres outbox. They commit together
  // (durable — a crash can't lose the email), the request returns without
  // waiting on SMTP, and the relay delivers in the background. The response time
  // no longer depends on whether an email was sent, so there's no timing oracle.
  await deps.db.runInTx(async () => {
    await insertResetToken(deps.db.db, { userId: user.id, tokenHash: hash, expiresAt });
    await auditWith(deps.auditor, meta).recordSync({
      action: "auth.user.password_reset_requested",
      actor: { type: "user", id: user.id },
      targetType: "user",
      targetId: user.id,
    });
    await deps.resetMailer.sendPasswordReset(user.email, resetLink(deps.cfg.resetUrlBase, token));
  });
}

/**
 * Reset-confirm: validates the token, sets the new password, then revokes EVERY
 * session and every other outstanding reset token for the user. Does NOT log the
 * user in (no tokens/cookie returned) — OWASP forbids auto-login on reset.
 */
export async function confirmReset(
  deps: AuthDeps,
  input: { token: string; password: string },
  meta: RequestMeta,
): Promise<void> {
  const row = await findActiveByHash(deps.db.db, hashRefreshToken(input.token));
  if (!row) throw new HTTPException(400, { message: "invalid or expired token" });

  // Run the two independent slow/IO steps together instead of in sequence: the
  // deliberately-expensive argon2 hash AND the user lookup (only needed for the
  // notice email) have no dependency on each other.
  const [passwordHash, user] = await Promise.all([
    hashPassword(input.password),
    findUserById(deps.db.db, row.user_id),
  ]);

  // One transaction: claim the token, set the password, revoke sessions + sibling
  // tokens, record the audit event, AND enqueue the "password changed" notice
  // into the outbox — all committed together, delivery handled by the relay.
  await deps.db.runInTx(async () => {
    // Conditional claim is the single-use guard; a lost race means already used.
    if (!(await claimToken(deps.db.db, row.id))) {
      throw new HTTPException(400, { message: "invalid or expired token" });
    }
    await updatePasswordHash(deps.db.db, row.user_id, passwordHash);
    await invalidateUserTokens(deps.db.db, row.user_id); // burn any sibling tokens
    await revokeAllForUser(deps.db.db, row.user_id); // log out every device
    await auditWith(deps.auditor, meta).recordSync({
      action: "auth.user.password_reset_completed",
      actor: { type: "user", id: row.user_id },
      targetType: "user",
      targetId: row.user_id,
    });
    if (user) await deps.resetMailer.sendPasswordChanged(user.email);
  });
}
