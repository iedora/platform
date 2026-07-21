import type { LessonRowDTO, TutorProgressDTO } from "#contracts/lessons"
import {
  computePricePennies,
  formatPennies,
  keepPct,
  RANK_EMOJI,
  RANK_LABEL,
  RANK_MIN_XP,
  RANK_ORDER,
} from "#db/domain/pricing"
import type { RankTier } from "#db/enums"
import type { Kysely } from "kysely"

import type { TutorDB } from "../schema.ts"

type DB = Kysely<TutorDB>

const COMPLETABLE = new Set(["booked", "charge_due", "awaiting_payment", "paid", "in_progress"])
const CANCELLABLE = new Set(["booked", "charge_due", "awaiting_payment", "paid"])

export async function listStudentLessons(db: DB, studentId: string): Promise<LessonRowDTO[]> {
  const rows = await db
    .selectFrom("lesson as l")
    .innerJoin("tutor as t", "t.id", "l.tutorId")
    .innerJoin("subject as s", "s.id", "l.subjectId")
    .leftJoin("review as rv", "rv.lessonId", "l.id")
    .where("l.studentId", "=", studentId)
    .select([
      "l.id as id",
      "l.status as status",
      "l.startsAtUtc as startsAtUtc",
      "l.qualificationId as qualificationId",
      "t.displayName as tutorName",
      "s.name as subjectName",
      "s.level as subjectLevel",
      "rv.id as reviewId",
    ])
    .orderBy("l.startsAtUtc", "desc")
    .execute()

  const now = Date.now()
  return rows.map((r) => {
    const isPast = new Date(r.startsAtUtc).getTime() < now
    const completed = r.status === "completed"
    return {
      id: r.id,
      subject: r.subjectLevel ? `${r.subjectLevel} ${r.subjectName}` : r.subjectName,
      tutor: r.tutorName,
      startsAtUtc: new Date(r.startsAtUtc).toISOString(),
      status: r.status,
      isPast,
      qualificationId: r.qualificationId,
      canComplete: COMPLETABLE.has(r.status),
      canReview: completed && Boolean(r.qualificationId) && !r.reviewId,
      canCancel: CANCELLABLE.has(r.status) && !isPast,
      canNoShow: CANCELLABLE.has(r.status) && isPast,
      reviewed: Boolean(r.reviewId),
    }
  })
}

export async function getTutorProgress(db: DB, qualificationIds: string[]): Promise<TutorProgressDTO[]> {
  if (qualificationIds.length === 0) return []
  const rows = await db
    .selectFrom("qualification as q")
    .innerJoin("subject as s", "s.id", "q.subjectId")
    .innerJoin("rank as r", "r.id", "q.rankId")
    .innerJoin("tutor as t", "t.id", "q.tutorId")
    .where("q.id", "in", qualificationIds)
    .select([
      "q.id as qualificationId",
      "q.tutorId as tutorId",
      "q.xp as xp",
      "s.name as subjectName",
      "s.level as subjectLevel",
      "s.baseRatePennies as baseRatePennies",
      "r.tier as tier",
      "t.displayName as tutorName",
    ])
    .execute()

  return rows.map((r) => {
    const tier = r.tier as RankTier
    const idx = RANK_ORDER.indexOf(tier)
    const nextTier = RANK_ORDER[idx + 1] as RankTier | undefined
    const floor = RANK_MIN_XP[tier]
    const ceil = nextTier ? RANK_MIN_XP[nextTier] : r.xp
    const progressPct = nextTier
      ? Math.min(100, Math.round(((r.xp - floor) / (ceil - floor)) * 100))
      : 100
    return {
      qualificationId: r.qualificationId,
      tutorId: r.tutorId,
      tutor: r.tutorName,
      subject: r.subjectLevel ? `${r.subjectLevel} ${r.subjectName}` : r.subjectName,
      rank: `${RANK_EMOJI[tier]} ${RANK_LABEL[tier]}`,
      tier,
      xp: r.xp,
      nextRank: nextTier ? `${RANK_EMOJI[nextTier]} ${RANK_LABEL[nextTier]}` : null,
      xpToNext: nextTier ? ceil - r.xp : null,
      progressPct,
      price: formatPennies(computePricePennies(r.baseRatePennies)),
      keepPct: `${keepPct(tier)}%`,
      nextKeepPct: nextTier ? `${keepPct(nextTier)}%` : null,
    }
  })
}
