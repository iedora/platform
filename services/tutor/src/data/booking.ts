import type { Kysely } from "kysely"

import type { TutorDB } from "../schema"

// Gateway rule: paid weekly lessons unlock once an intro exists with a tutor.
export async function hasLessonWith(
  db: Kysely<TutorDB>,
  tutorId: string,
  studentId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("lesson")
    .select("id")
    .where("tutorId", "=", tutorId)
    .where("studentId", "=", studentId)
    .executeTakeFirst()
  return Boolean(row)
}

/** The tutor's IANA zone — a recurring series pins to their wall-clock. */
export async function tutorTimezone(db: Kysely<TutorDB>, tutorId: string): Promise<string> {
  const row = await db
    .selectFrom("tutor")
    .select("timezone")
    .where("id", "=", tutorId)
    .executeTakeFirstOrThrow()
  return row.timezone
}
