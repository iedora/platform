import type { RankTier } from "@iedora/product-tutor/enums"

// View types for the lessons dashboard. The reads now live in products/tutor/api;
// these shapes are what the list component + the BFF wrapper (lib/api/lessons)
// consume.

export type LessonRow = {
  id: string
  subject: string
  tutor: string
  when: string
  status: string
  isPast: boolean
  qualificationId: string | null
  canComplete: boolean
  canReview: boolean
  canCancel: boolean
  canNoShow: boolean
  reviewed: boolean
}

export type TutorProgress = {
  qualificationId: string
  tutorId: string
  tutor: string
  subject: string
  rank: string
  tier: RankTier
  xp: number
  nextRank: string | null
  xpToNext: number | null
  progressPct: number
  price: string
  /** Share the tutor keeps after commission at the current rank, e.g. "80%". */
  keepPct: string
  /** Share kept at the next rank, the reward for ranking up. Null at top rank. */
  nextKeepPct: string | null
}
