import type { ProgressionResult } from "@iedora/tutor-contracts/progression"
import { RANK_EMOJI, RANK_LABEL } from "@iedora/tutor-db/domain/pricing"
import { CANCELLATION_CUTOFF_HOURS, canTransition } from "@iedora/tutor-db/domain/status"
import type { LessonStatus, Party, ReviewTag } from "@iedora/tutor-db/enums"
import type { Kysely } from "kysely"

import { conversationId, postSystem } from "../../data/conversations"
import {
  awardXp,
  bumpLearner,
  evaluateTutorBadges,
  progressQuests,
  type QuestKind,
  updateWeeklyStreak,
  type XpResult,
} from "../../data/gamification"
import { refundLessonPayment } from "../../data/payments"
import type { TutorDeps } from "../../deps"
import { invalid } from "../../errors"
import { inngest, lessonCancelled } from "../../lib/inngest"
import type { TutorDB } from "../../schema"

type DB = Kysely<TutorDB>

async function setStatus(db: DB, lessonId: string, from: LessonStatus, to: LessonStatus, reason: string) {
  await db.updateTable("lesson").set({ status: to }).where("id", "=", lessonId).execute()
  await db.insertInto("lessonEvent").values({ lessonId, fromStatus: from, toStatus: to, reason }).execute()
}

async function qualMeta(db: DB, qualificationId: string) {
  const meta = await db
    .selectFrom("qualification as q")
    .innerJoin("subject as s", "s.id", "q.subjectId")
    .innerJoin("tutor as t", "t.id", "q.tutorId")
    .where("q.id", "=", qualificationId)
    .select(["t.displayName as tutorName", "s.name as subjectName", "s.level as subjectLevel"])
    .executeTakeFirstOrThrow()
  return {
    ...meta,
    subject: meta.subjectLevel ? `${meta.subjectLevel} ${meta.subjectName}` : meta.subjectName,
  }
}

async function postPromotion(db: DB, convId: string, qualificationId: string, result: XpResult) {
  if (!result.promoted) return
  const meta = await qualMeta(db, qualificationId)
  // Rank-up no longer changes the student's price (it lowers the tutor's
  // commission), so this is a plain milestone rather than a price change.
  await postSystem(db, convId, {
    body: `🎉 ${meta.tutorName} reached ${RANK_EMOJI[result.toTier]} ${RANK_LABEL[result.toTier]} in ${meta.subject}`,
    type: "rank_up",
  })
}

async function postProgress(
  db: DB,
  tutorId: string,
  studentId: string,
  qualificationId: string,
  result: XpResult,
) {
  const meta = await qualMeta(db, qualificationId)
  const convId = await conversationId(db, tutorId, studentId)
  const sign = result.delta >= 0 ? "＋" : ""
  await postSystem(db, convId, { body: `${sign}${result.delta} XP · ${meta.subject}`, type: "rank_up" })
  await postPromotion(db, convId, qualificationId, result)
}

/** Builds what the client needs to fire toasts for a progression event. */
async function toProgression(
  db: DB,
  xp: XpResult,
  qualificationId: string,
  engagement: { quests: string[]; badges: string[]; streak: number | null },
): Promise<ProgressionResult> {
  const meta = await qualMeta(db, qualificationId)
  return {
    xpDelta: xp.delta,
    promotedTo: xp.promoted ? `${RANK_EMOJI[xp.toTier]} ${RANK_LABEL[xp.toTier]}` : null,
    tutorName: meta.tutorName,
    subject: meta.subject,
    quests: engagement.quests,
    badges: engagement.badges,
    streak: engagement.streak,
  }
}

/** Streaks, weekly quests and badges — the dopamine layer around every event. */
async function runEngagement(
  db: DB,
  input: {
    tutorId: string
    studentId: string
    qualificationId: string
    tutorKind: QuestKind | null
    studentKind: QuestKind | null
    bumpStreaks: boolean
  },
): Promise<{ quests: string[]; badges: string[]; streak: number | null }> {
  const convId = await conversationId(db, input.tutorId, input.studentId)
  const questTitles: string[] = []
  let streak: number | null = null

  if (input.bumpStreaks) {
    await updateWeeklyStreak(db, "tutor", input.tutorId)
    const student = await updateWeeklyStreak(db, "student", input.studentId)
    streak = student.count
    if (student.extended && student.count > 1) {
      await postSystem(db, convId, { body: `🔥 ${student.count}-week streak!`, type: "rank_up" })
    }
  }

  if (input.tutorKind) {
    for (const quest of await progressQuests(db, "tutor", input.tutorId, input.tutorKind)) {
      const result = await awardXp(db, {
        qualificationId: input.qualificationId,
        tutorId: input.tutorId,
        type: "quest_reward",
        delta: quest.xpReward,
        reason: quest.title,
      })
      await postSystem(db, convId, {
        body: `🏅 Quest complete · ${quest.title} · ＋${quest.xpReward} XP`,
        type: "rank_up",
      })
      await postPromotion(db, convId, input.qualificationId, result)
      questTitles.push(quest.title)
    }
  }

  if (input.studentKind) {
    for (const quest of await progressQuests(db, "student", input.studentId, input.studentKind)) {
      await bumpLearner(db, input.studentId, quest.xpReward)
      await postSystem(db, convId, {
        body: `🏅 Quest complete · ${quest.title} · ＋${quest.xpReward} XP`,
        type: "rank_up",
      })
      questTitles.push(quest.title)
    }
  }

  const badges = await evaluateTutorBadges(db, input.tutorId)
  for (const name of badges) {
    await postSystem(db, convId, { body: `🏆 Badge unlocked · ${name}`, type: "rank_up" })
  }

  return { quests: questTitles, badges, streak }
}

/** Complete a lesson, routing through the state machine (booked→in_progress→completed). */
export async function completeLesson(
  deps: TutorDeps,
  lessonId: string,
): Promise<ProgressionResult | null> {
  const db = deps.db.db
  const lesson = await db
    .selectFrom("lesson")
    .select(["id", "status", "tutorId", "studentId", "qualificationId"])
    .where("id", "=", lessonId)
    .executeTakeFirstOrThrow()

  let current = lesson.status
  if (!canTransition(current, "completed") && canTransition(current, "in_progress")) {
    await setStatus(db, lesson.id, current, "in_progress", "Lesson started")
    current = "in_progress"
  }
  if (!canTransition(current, "completed")) {
    throw invalid(`Cannot complete a ${current} lesson.`)
  }
  await setStatus(db, lesson.id, current, "completed", "Lesson completed")

  await bumpLearner(db, lesson.studentId, 10)

  if (!lesson.qualificationId) {
    await db
      .updateTable("student")
      .set({ hasCompletedIntro: true })
      .where("id", "=", lesson.studentId)
      .execute()
    await postSystem(db, await conversationId(db, lesson.tutorId, lesson.studentId), {
      body: "Intro completed 🎉 Weekly lessons unlocked",
    })
    return null
  }

  const result = await awardXp(db, {
    qualificationId: lesson.qualificationId,
    tutorId: lesson.tutorId,
    type: "lesson_completed",
  })
  await postProgress(db, lesson.tutorId, lesson.studentId, lesson.qualificationId, result)

  const engagement = await runEngagement(db, {
    tutorId: lesson.tutorId,
    studentId: lesson.studentId,
    qualificationId: lesson.qualificationId,
    tutorKind: "lesson_completed",
    studentKind: "lesson_completed",
    bumpStreaks: true,
  })
  return toProgression(db, result, lesson.qualificationId, engagement)
}

export async function leaveReview(
  deps: TutorDeps,
  input: {
    lessonId: string
    studentId: string
    rating: number
    comment?: string
    tags?: ReviewTag[]
  },
): Promise<ProgressionResult> {
  const db = deps.db.db
  const lesson = await db
    .selectFrom("lesson")
    .select(["id", "status", "tutorId", "studentId", "qualificationId"])
    .where("id", "=", input.lessonId)
    .executeTakeFirstOrThrow()

  if (lesson.status !== "completed") throw invalid("You can only review a completed lesson.")
  if (!lesson.qualificationId) throw invalid("Intro lessons can't be reviewed.")

  await db
    .insertInto("review")
    .values({
      lessonId: lesson.id,
      studentId: input.studentId,
      qualificationId: lesson.qualificationId,
      rating: input.rating,
      comment: input.comment ?? null,
      tags: input.tags ?? [],
    })
    .execute()

  const type =
    input.rating >= 5
      ? "review_5"
      : input.rating === 4
        ? "review_4"
        : input.rating === 3
          ? "review_3"
          : "review_low"

  await postSystem(db, await conversationId(db, lesson.tutorId, lesson.studentId), {
    body: `⭐ ${input.rating}★ review left`,
  })

  const result = await awardXp(db, {
    qualificationId: lesson.qualificationId,
    tutorId: lesson.tutorId,
    type,
  })
  await postProgress(db, lesson.tutorId, lesson.studentId, lesson.qualificationId, result)

  const engagement = await runEngagement(db, {
    tutorId: lesson.tutorId,
    studentId: lesson.studentId,
    qualificationId: lesson.qualificationId,
    tutorKind: input.rating === 5 ? "review_5" : null,
    studentKind: "review_left",
    bumpStreaks: false,
  })
  return toProgression(db, result, lesson.qualificationId, engagement)
}

function isLateCancel(startsAtUtc: Date): boolean {
  const hoursUntil = (startsAtUtc.getTime() - Date.now()) / 3_600_000
  return hoursUntil < CANCELLATION_CUTOFF_HOURS
}

/** Cancel a lesson. Within the cutoff it's a charged `late_cancelled`, else free. */
export async function cancelLesson(
  deps: TutorDeps,
  input: { lessonId: string; by: Party },
): Promise<{ late: boolean }> {
  const db = deps.db.db
  const lesson = await db
    .selectFrom("lesson")
    .select(["id", "status", "startsAtUtc", "tutorId", "studentId"])
    .where("id", "=", input.lessonId)
    .executeTakeFirstOrThrow()

  const late = isLateCancel(new Date(lesson.startsAtUtc))
  const to: LessonStatus = late ? "late_cancelled" : "cancelled"
  if (!canTransition(lesson.status, to)) {
    throw invalid(`Cannot cancel a ${lesson.status} lesson.`)
  }
  await setStatus(db, lesson.id, lesson.status, to, `Cancelled by ${input.by}${late ? " (late)" : ""}`)

  // Kill the pending charge timer for this lesson.
  await inngest.send(lessonCancelled.create({ lessonId: lesson.id }))

  const convId = await conversationId(db, lesson.tutorId, lesson.studentId)
  await postSystem(db, convId, {
    body: late ? "Lesson cancelled late — charged per policy" : "Lesson cancelled (free)",
  })
  return { late }
}

/** Mark a no-show. Tutor no-show refunds the student and costs the tutor XP. */
export async function markNoShow(
  deps: TutorDeps,
  input: { lessonId: string; who: Party },
): Promise<void> {
  const db = deps.db.db
  const lesson = await db
    .selectFrom("lesson")
    .select(["id", "status", "tutorId", "studentId", "qualificationId"])
    .where("id", "=", input.lessonId)
    .executeTakeFirstOrThrow()

  const to: LessonStatus = input.who === "tutor" ? "tutor_no_show" : "student_no_show"

  let current = lesson.status
  if (!canTransition(current, to) && canTransition(current, "in_progress")) {
    await setStatus(db, lesson.id, current, "in_progress", "Lesson started")
    current = "in_progress"
  }
  if (!canTransition(current, to)) {
    throw invalid(`Cannot mark a ${lesson.status} lesson as ${to}.`)
  }
  await setStatus(db, lesson.id, current, to, `${input.who} no-show`)

  const convId = await conversationId(db, lesson.tutorId, lesson.studentId)

  if (input.who === "tutor") {
    // The lesson's status keeps saying *why* (tutor_no_show); the money outcome
    // lives on the payment aggregate. Refund is a no-op if nothing was charged.
    const refunded = await refundLessonPayment(db, deps.billing, lesson.id)
    await postSystem(db, convId, {
      body: refunded ? "Tutor didn't show — you've been refunded." : "Tutor didn't show.",
    })
    if (lesson.qualificationId) {
      const result = await awardXp(db, {
        qualificationId: lesson.qualificationId,
        tutorId: lesson.tutorId,
        type: "tutor_no_show",
      })
      await postProgress(db, lesson.tutorId, lesson.studentId, lesson.qualificationId, result)
    }
  } else {
    await postSystem(db, convId, { body: "Marked as no-show" })
  }
}
