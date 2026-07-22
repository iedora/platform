import {
  burnFamily,
  findUserById,
  foldSessionFamilies,
  revokeOtherFamilies,
  writePassword,
} from "../../platform/accounts.ts"
import { emitAudit } from "../../platform/audit.ts"
import { db } from "../../platform/db.ts"
import { passwordChangedEmail } from "../../platform/emails.ts"
import { HttpError } from "../../platform/http.ts"
import { enqueueEmail } from "../../platform/mailer.ts"
import { passwordProvider } from "../../platform/providers/password.ts"

/** One row per active refresh family — a "device" in the account UI. */
export type SessionView = {
  family: string
  ip: string | null
  userAgent: string | null
  createdAt: string
  lastActiveAt: string
  expiresAt: string
  current: boolean
}

/** The caller's live sessions, one entry per family, newest first. `current`
 *  marks the family the calling token belongs to. */
export async function listSessions(
  tenantId: string,
  userId: string,
  currentSid: string,
): Promise<SessionView[]> {
  const rows = await db
    .selectFrom("session")
    .selectAll()
    .where("tenantId", "=", tenantId)
    .where("userId", "=", userId)
    .where("revokedAt", "is", null)
    .orderBy("createdAt", "asc")
    .execute()
  return foldSessionFamilies(rows).map((f) => ({
    family: f.family,
    ip: f.last.ip,
    userAgent: f.last.userAgent,
    createdAt: f.first.createdAt.toISOString(),
    lastActiveAt: f.last.createdAt.toISOString(),
    expiresAt: f.last.expiresAt.toISOString(),
    current: f.family === currentSid,
  }))
}

/** Change the caller's password. When a change isn't forced (`mustChangePassword`)
 *  the current password must be supplied + correct. Clears the forced-change flag
 *  and signs every OTHER device out (keeps the calling family). */
export async function changePassword(
  tenantId: string,
  userId: string,
  input: { currentPassword?: string; newPassword: string },
  keepFamily: string,
): Promise<void> {
  const user = await findUserById(tenantId, userId)
  if (!user) throw new HttpError(404, "unknown_user")
  const identity = await db
    .selectFrom("identity")
    .select("passwordHash")
    .where("tenantId", "=", tenantId)
    .where("userId", "=", userId)
    .where("providerId", "=", "password")
    .executeTakeFirst()
  if (!identity?.passwordHash) {
    throw new HttpError(400, "no_password", "This account has no password to change")
  }

  if (!user.mustChangePassword) {
    if (!input.currentPassword) throw new HttpError(422, "current_password_required")
    if (!(await passwordProvider.verify(input.currentPassword, identity.passwordHash))) {
      throw new HttpError(401, "wrong_password", "Current password is incorrect")
    }
  }

  const hash = await passwordProvider.hash(input.newPassword)
  const tenant = await db
    .selectFrom("tenant")
    .select("name")
    .where("id", "=", tenantId)
    .executeTakeFirstOrThrow()
  const notice = passwordChangedEmail(tenant.name)

  await db.transaction().execute(async (trx) => {
    await writePassword(trx, { tenantId, userId, email: user.email, hash })
    // Every other device must re-authenticate after a password change.
    await revokeOtherFamilies(trx, tenantId, userId, keepFamily)
    await enqueueEmail(trx, {
      tenantId,
      to: user.email,
      subject: notice.subject,
      html: notice.html,
      text: notice.text,
    })
    await emitAudit(trx, {
      tenantId,
      action: "auth.password.changed",
      actorType: "user",
      actorId: userId,
      entityType: "user",
      entityId: userId,
    })
  })
}

/** Sign out one of the caller's devices (guarded to families they own). */
export async function revokeSession(
  tenantId: string,
  userId: string,
  family: string,
): Promise<void> {
  const owned = await db
    .selectFrom("session")
    .select("id")
    .where("tenantId", "=", tenantId)
    .where("userId", "=", userId)
    .where("familyId", "=", family)
    .executeTakeFirst()
  if (!owned) throw new HttpError(404, "unknown_session")
  await burnFamily(tenantId, family)
}

/** Sign out all of the caller's other devices, keeping the current one. */
export async function revokeOtherSessions(
  tenantId: string,
  userId: string,
  keepFamily: string,
): Promise<void> {
  await revokeOtherFamilies(db, tenantId, userId, keepFamily)
}
