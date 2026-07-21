import type { Kysely } from "kysely"

import type { TutorDB } from "../schema.ts"

type DB = Kysely<TutorDB>

export async function conversationParties(db: DB, conversationId: string) {
  return db
    .selectFrom("conversation")
    .select(["tutorId", "studentId"])
    .where("id", "=", conversationId)
    .executeTakeFirst()
}

/** The soonest upcoming lesson not already mid-negotiation. */
export async function nextReschedulableLesson(db: DB, tutorId: string, studentId: string) {
  return db
    .selectFrom("lesson")
    .select(["id", "startsAtUtc"])
    .where("tutorId", "=", tutorId)
    .where("studentId", "=", studentId)
    .where("negotiation", "=", "none")
    .where("startsAtUtc", ">", new Date())
    .where("status", "in", ["booked", "charge_due", "awaiting_payment", "paid"])
    .orderBy("startsAtUtc", "asc")
    .limit(1)
    .executeTakeFirst()
}

/**
 * Availability rules and the zone they're written in, together — a wall-clock rule
 * without its zone isn't interpretable.
 */
export async function tutorAvailability(db: DB, tutorId: string) {
  const [rules, tutor] = await Promise.all([
    db
      .selectFrom("availability")
      .select(["weekday", "startTime", "endTime"])
      .where("tutorId", "=", tutorId)
      .execute(),
    db.selectFrom("tutor").select("timezone").where("id", "=", tutorId).executeTakeFirstOrThrow(),
  ])
  return { rules, tz: tutor.timezone }
}

/** Thread + its lesson, throwing if missing (used inside the negotiation flow). */
export async function threadContext(db: DB, threadId: string) {
  return db
    .selectFrom("rescheduleThread as t")
    .innerJoin("lesson as l", "l.id", "t.lessonId")
    .where("t.id", "=", threadId)
    .select([
      "t.id as threadId",
      "t.status as threadStatus",
      "l.id as lessonId",
      "l.status as lessonStatus",
      "l.tutorId as tutorId",
      "l.studentId as studentId",
    ])
    .executeTakeFirstOrThrow()
}

export async function activeProposalOrThrow(db: DB, threadId: string) {
  return db
    .selectFrom("timeProposal")
    .selectAll()
    .where("threadId", "=", threadId)
    .where("isActive", "=", true)
    .executeTakeFirstOrThrow()
}
