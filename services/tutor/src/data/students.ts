import type { Kysely } from "kysely"

import type { TutorDB } from "../schema"

// Resolve the student/tutor profile for an authenticated user. The user id ALWAYS
// comes from the verified Bearer principal (c.get("user").userId), never the client.
// A user is a student XOR a tutor (whichever profile exists).
export function studentByUserId(db: Kysely<TutorDB>, userId: string) {
  return db
    .selectFrom("student")
    .select(["id", "userId"])
    .where("userId", "=", userId)
    .executeTakeFirst()
}

export function tutorByUserId(db: Kysely<TutorDB>, userId: string) {
  return db
    .selectFrom("tutor")
    .select(["id", "userId"])
    .where("userId", "=", userId)
    .executeTakeFirst()
}
