import type { SessionDTO } from "@iedora/tutor-contracts/session"
import { DEFAULT_TIMEZONE } from "@iedora/tutor-db/domain/time"
import type { Kysely } from "kysely"

import type { TutorConfig } from "../config"
import type { TutorDB } from "../schema"

type DB = Kysely<TutorDB>

/** A default display name from the user's email local-part (bootstrap only). */
function displayNameFrom(email: string | undefined): string {
  return email?.split("@")[0]?.trim() || "Student"
}

/**
 * The viewer's profile for `GET /api/me`. Resolves tutor XOR student membership;
 * on a first authenticated request with neither, bootstraps a student row (every
 * account can book/chat immediately — tutors are promoted separately). Admin is
 * the ADMIN_EMAILS allowlist or an `admin` row.
 */
export async function resolveSession(
  db: DB,
  cfg: TutorConfig,
  userId: string,
  email: string | undefined,
): Promise<SessionDTO> {
  const isAdmin = await resolveAdmin(db, cfg, email)

  const tutor = await db
    .selectFrom("tutor")
    .select(["id", "timezone", "timezoneSource"])
    .where("userId", "=", userId)
    .executeTakeFirst()
  if (tutor) {
    return {
      role: "tutor",
      tutorId: tutor.id,
      studentId: null,
      timezone: tutor.timezone,
      timezoneSource: tutor.timezoneSource,
      isAdmin,
      learnerLevel: null,
      learnerXp: null,
    }
  }

  let student = await db
    .selectFrom("student")
    .select(["id", "timezone", "timezoneSource", "learnerLevel", "learnerXp"])
    .where("userId", "=", userId)
    .executeTakeFirst()

  if (!student) {
    await db
      .insertInto("student")
      .values({ userId, displayName: displayNameFrom(email) })
      .execute()
    student = await db
      .selectFrom("student")
      .select(["id", "timezone", "timezoneSource", "learnerLevel", "learnerXp"])
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow()
  }

  return {
    role: "student",
    tutorId: null,
    studentId: student.id,
    timezone: student.timezone ?? DEFAULT_TIMEZONE,
    timezoneSource: student.timezoneSource ?? "auto",
    isAdmin,
    learnerLevel: student.learnerLevel,
    learnerXp: student.learnerXp,
  }
}

async function resolveAdmin(db: DB, cfg: TutorConfig, email: string | undefined): Promise<boolean> {
  if (!email) return false
  const lower = email.toLowerCase()
  if (cfg.adminEmails.includes(lower)) return true
  const row = await db.selectFrom("admin").select("id").where("email", "=", email).executeTakeFirst()
  return Boolean(row)
}
