import type { UpdateTimezoneResult } from "#contracts/account"
import type { TimezoneSource } from "#db/enums"
import type { Kysely } from "kysely"

import type { TutorDB } from "../schema"

type DB = Kysely<TutorDB>

export type ProfileTz = {
  kind: "student" | "tutor"
  id: string
  timezone: string
  timezoneSource: TimezoneSource
}

/** The authenticated user's profile with its current timezone state. */
export async function profileTz(db: DB, userId: string): Promise<ProfileTz | null> {
  const t = await db
    .selectFrom("tutor")
    .select(["id", "timezone", "timezoneSource"])
    .where("userId", "=", userId)
    .executeTakeFirst()
  if (t) return { kind: "tutor", ...t }
  const s = await db
    .selectFrom("student")
    .select(["id", "timezone", "timezoneSource"])
    .where("userId", "=", userId)
    .executeTakeFirst()
  if (s) return { kind: "student", ...s }
  return null
}

// A background detection (source="auto") must never clobber a deliberate manual
// choice; an unchanged save is a no-op. So a "manual" row is only overwritten by
// another manual save.
export async function setTimezone(
  db: DB,
  p: ProfileTz,
  timezone: string,
  source: TimezoneSource,
): Promise<UpdateTimezoneResult> {
  if (source === "auto" && p.timezoneSource === "manual") {
    return { timezone: p.timezone, changed: false }
  }
  if (timezone === p.timezone && source === p.timezoneSource) {
    return { timezone, changed: false }
  }
  const set = { timezone, timezoneSource: source }
  if (p.kind === "tutor") {
    await db.updateTable("tutor").set(set).where("id", "=", p.id).execute()
  } else {
    await db.updateTable("student").set(set).where("id", "=", p.id).execute()
  }
  return { timezone, changed: true }
}
