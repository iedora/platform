import { computePricePennies, formatPennies } from "#db/domain/pricing"
import {
  INTRO_DURATION_MIN,
  STANDARD_BUFFER_MIN,
  STANDARD_DURATION_MIN,
} from "#db/domain/status"
import type { Kysely } from "kysely"

import { bumpConversation, ensureConversation } from "../../data/conversations.ts"
import { tutorTimezone } from "../../data/booking.ts"
import type { TutorDeps } from "../../deps.ts"
import { invalid } from "../../errors.ts"
import { scheduleLessonTimers } from "../../jobs/scheduler.ts"
import { nextOccurrences } from "../../lib/slots.ts"
import type { TutorDB } from "../../schema.ts"

type DB = Kysely<TutorDB>

const WEEKS_AHEAD = 6

/**
 * Books the free 15-minute intro: a lesson row + its audit event, and a system
 * message in the conversation. Returns the conversation id so the caller redirects.
 */
export async function bookIntroLesson(
  deps: TutorDeps,
  input: { tutorId: string; studentId: string; subjectId: string; startsAtUtc: string },
): Promise<{ conversationId: string }> {
  const db: DB = deps.db.db
  const lesson = await db
    .insertInto("lesson")
    .values({
      tutorId: input.tutorId,
      studentId: input.studentId,
      subjectId: input.subjectId,
      type: "free_intro",
      mode: "one_off",
      status: "booked",
      startsAtUtc: new Date(input.startsAtUtc),
      durationMin: INTRO_DURATION_MIN,
      bufferMin: 0,
      pricePennies: 0,
    })
    .returning("id")
    .executeTakeFirstOrThrow()

  await db
    .insertInto("lessonEvent")
    .values({ lessonId: lesson.id, toStatus: "booked", reason: "Free intro booked" })
    .execute()

  const conversationId = await ensureConversation(db, input.tutorId, input.studentId)

  await db
    .insertInto("message")
    .values({
      conversationId,
      senderType: "system",
      type: "system",
      // The instant, not a rendered time — tutor and student can be in different
      // zones; the reader's zone decides the string.
      body: "Free intro booked",
      payload: JSON.stringify({ startsAtUtc: input.startsAtUtc }),
    })
    .execute()
  await bumpConversation(db, conversationId)

  return { conversationId }
}

/**
 * Books a recurring weekly series: snapshots the price from the qualification's
 * rank, creates the series, materialises the next `WEEKS_AHEAD` lessons, and arms
 * a per-lesson charge timer. Pins to the tutor's wall-clock (looked up here).
 * Gated on an existing intro with the tutor.
 */
export async function bookRecurringSeries(
  deps: TutorDeps,
  input: {
    tutorId: string
    studentId: string
    qualificationId: string
    weekday: number
    localTime: string
  },
): Promise<{ conversationId: string; count: number }> {
  const db: DB = deps.db.db

  const intro = await db
    .selectFrom("lesson")
    .select("id")
    .where("tutorId", "=", input.tutorId)
    .where("studentId", "=", input.studentId)
    .executeTakeFirst()
  if (!intro) throw invalid("Book a free intro with this tutor first.")

  const qual = await db
    .selectFrom("qualification as q")
    .innerJoin("subject as s", "s.id", "q.subjectId")
    .innerJoin("rank as r", "r.id", "q.rankId")
    .where("q.id", "=", input.qualificationId)
    .select([
      "q.subjectId as subjectId",
      "s.name as subjectName",
      "s.level as subjectLevel",
      "s.baseRatePennies as baseRatePennies",
      "r.tier as rankTier",
    ])
    .executeTakeFirstOrThrow()

  // Price is snapshotted here; later rank-ups never change it (rank moves the
  // platform commission, not the student's price).
  const pricePennies = computePricePennies(qual.baseRatePennies)
  const tz = await tutorTimezone(db, input.tutorId)

  const series = await db
    .insertInto("lessonSeries")
    .values({
      studentId: input.studentId,
      tutorId: input.tutorId,
      qualificationId: input.qualificationId,
      weekday: input.weekday,
      localTime: input.localTime,
      timezone: tz,
      pricePennies,
      status: "active",
      startDate: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow()

  const occurrences = nextOccurrences({
    weekday: input.weekday,
    localTime: input.localTime,
    tz,
    count: WEEKS_AHEAD,
  })

  if (occurrences.length > 0) {
    const lessons = await db
      .insertInto("lesson")
      .values(
        occurrences.map((iso) => ({
          seriesId: series.id,
          studentId: input.studentId,
          tutorId: input.tutorId,
          subjectId: qual.subjectId,
          qualificationId: input.qualificationId,
          type: "standard" as const,
          mode: "recurring" as const,
          status: "booked" as const,
          startsAtUtc: new Date(iso),
          durationMin: STANDARD_DURATION_MIN,
          bufferMin: STANDARD_BUFFER_MIN,
          pricePennies,
        })),
      )
      .returning(["id", "startsAtUtc"])
      .execute()

    // Each lesson gets its own durable timers (room open + charge at the deadline).
    await Promise.all(
      lessons.map((lesson) =>
        scheduleLessonTimers(deps.jobs, {
          lessonId: lesson.id,
          startsAtUtc: new Date(lesson.startsAtUtc).toISOString(),
          mode: "recurring",
        }),
      ),
    )
  }

  const conversationId = await ensureConversation(db, input.tutorId, input.studentId)
  const subjectLabel = qual.subjectLevel ? `${qual.subjectLevel} ${qual.subjectName}` : qual.subjectName

  await db
    .insertInto("message")
    .values({
      conversationId,
      senderType: "system",
      type: "system",
      // Recurrence weekday/time are the TUTOR's wall-clock; send the first
      // occurrence as an instant and let the reader's zone format it.
      body: `Weekly ${subjectLabel} booked · ${formatPennies(pricePennies)}/lesson · ${occurrences.length} lessons scheduled, starting`,
      payload: JSON.stringify({ startsAtUtc: occurrences[0] }),
    })
    .execute()
  await bumpConversation(db, conversationId)

  return { conversationId, count: occurrences.length }
}
