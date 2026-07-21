// Wire contracts for the student's lessons view (the /lessons dashboard). The
// service returns raw `startsAtUtc` (ISO) + the state booleans it computes from
// status/now; the web formats the display time with the viewer's timezone.

import { z } from "zod"

export interface LessonRowDTO {
  id: string
  subject: string
  tutor: string
  startsAtUtc: string // ISO; web formats to `when` with the viewer's tz
  status: string
  isPast: boolean
  qualificationId: string | null
  canComplete: boolean
  canReview: boolean
  canCancel: boolean
  canNoShow: boolean
  reviewed: boolean
}

export interface TutorProgressDTO {
  qualificationId: string
  tutorId: string
  tutor: string
  subject: string
  rank: string
  tier: string // raw RankTier value
  xp: number
  nextRank: string | null
  xpToNext: number | null
  progressPct: number
  price: string
  keepPct: string
  nextKeepPct: string | null
}

export interface StudentLessonsDTO {
  lessons: LessonRowDTO[]
  progress: TutorProgressDTO[]
}

/* ----------------------------- lesson mutations ---------------------------- */
// The web parses with these for a friendly early error; the service re-validates
// and, for reviews, enforces the closed tag vocabulary authoritatively.

const party = z.enum(["tutor", "student"])

export const completeLessonInput = z.object({ lessonId: z.uuid() })
export type CompleteLessonInput = z.infer<typeof completeLessonInput>

export const cancelLessonInput = z.object({
  lessonId: z.uuid(),
  as: party.default("student"),
})
export type CancelLessonInput = z.infer<typeof cancelLessonInput>
export interface CancelLessonResult {
  late: boolean
}

export const markNoShowInput = z.object({ lessonId: z.uuid(), who: party })
export type MarkNoShowInput = z.infer<typeof markNoShowInput>

export const leaveReviewInput = z.object({
  lessonId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  // Loose here (a friendly early error); the service enforces the closed
  // REVIEW_TAGS vocabulary so the tutor-profile tag counts stay meaningful.
  tags: z.array(z.string()).max(32).default([]),
})
export type LeaveReviewInput = z.infer<typeof leaveReviewInput>

