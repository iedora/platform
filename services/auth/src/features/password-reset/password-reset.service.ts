import { findUserByEmail, revokeAllUserSessions, writePassword } from "../../platform/accounts"
import { config } from "../../platform/config"
import { db } from "../../platform/db"
import { passwordChangedEmail, passwordResetEmail } from "../../platform/emails"
import { HttpError } from "../../platform/http"
import { enqueueEmail } from "../../platform/mailer"
import { passwordProvider } from "../../platform/providers/password"
import type { Tenant } from "../../platform/schema"
import { hashToken, newOpaqueToken } from "../../platform/tokens"

/** Where the reset link points: the tenant's own app origin, then a config
 *  fallback, then the issuer as a last resort. */
function appOrigin(tenant: Tenant): string {
  return tenant.allowedOrigins[0] ?? config.appBaseUrl ?? config.issuerUrl
}

/** Start a reset. Always succeeds from the caller's view (never reveals whether
 *  the email exists); when the user is real, a hashed token is stored and a
 *  reset email is queued in the same transaction. */
export async function requestPasswordReset(tenant: Tenant, email: string): Promise<void> {
  const user = await findUserByEmail(tenant.id, email)
  if (!user) return

  const { token, hash } = newOpaqueToken()
  const expiresAt = new Date(Date.now() + config.resetTtl * 1000)
  const url = `${appOrigin(tenant)}${config.resetPath}?token=${encodeURIComponent(token)}`
  const mail = passwordResetEmail(tenant.name, url, Math.round(config.resetTtl / 60))

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("passwordResetToken")
      .values({ tenantId: tenant.id, userId: user.id, tokenHash: hash, expiresAt })
      .execute()
    await enqueueEmail(trx, {
      tenantId: tenant.id,
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    })
  })
}

/** Complete a reset: set the new password, revoke every session, and email a
 *  security notice. Works for accounts with no prior password (OAuth-only or a
 *  migrated user) — writePassword creates the identity. */
export async function resetPassword(
  tenant: Tenant,
  token: string,
  newPassword: string,
): Promise<void> {
  const row = await db
    .selectFrom("passwordResetToken")
    .selectAll()
    .where("tenantId", "=", tenant.id)
    .where("tokenHash", "=", hashToken(token))
    .executeTakeFirst()
  if (!row || row.claimedAt || row.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, "invalid_token", "This reset link is invalid or has expired")
  }

  const user = await db
    .selectFrom("user")
    .select(["id", "email"])
    .where("id", "=", row.userId)
    .executeTakeFirstOrThrow()
  const hash = await passwordProvider.hash(newPassword)
  const notice = passwordChangedEmail(tenant.name)

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("passwordResetToken")
      .set({ claimedAt: new Date() })
      .where("id", "=", row.id)
      .execute()
    await writePassword(trx, { tenantId: tenant.id, userId: user.id, email: user.email, hash })
    // A reset invalidates every existing session.
    await revokeAllUserSessions(trx, tenant.id, user.id)
    await enqueueEmail(trx, {
      tenantId: tenant.id,
      to: user.email,
      subject: notice.subject,
      html: notice.html,
      text: notice.text,
    })
  })
}
