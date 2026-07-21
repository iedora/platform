import type { ReviewTag } from "@iedora/product-tutor/enums"
import type { TutorHighlight } from "@iedora/product-tutor/types"

import type { AvailabilityRule } from "./booking.slots"

// View types for the booking/profile surface. The reads AND the booking mutations
// now live in products/tutor/api (public tutor-profile + browse + gateway + intro/
// recurring); these shapes are what the pages/components + the BFF wrappers
// (lib/api/{tutor-profile,booking}) consume.

export type TutorStats = {
  lessonsTaught: number
  reviewCount: number
  rating: number | null
  superTutor: boolean
}

export type BookableSubject = {
  qualificationId: string
  subjectId: string
  subject: string
  rank: string
  pricePennies: number
  price: string
}

export type TutorBooking = {
  id: string
  displayName: string
  university: string | null
  degree: string | null
  tagline: string | null
  bio: string | null
  teachingStyle: string | null
  avatarUrl: string | null
  highlights: TutorHighlight[]
  linkedinUrl: string | null
  tz: string
  stats: TutorStats
  subjects: BookableSubject[]
  availability: AvailabilityRule[]
}

export type TutorReview = {
  id: string
  rating: number
  comment: string
  tags: ReviewTag[]
  studentName: string
  subject: string
  createdAt: Date
  pinned: boolean
}

/** Counts for 5★ down to 1★, for the distribution bars. */
export type RatingBreakdown = Record<1 | 2 | 3 | 4 | 5, number>

/** A tag and how many parents picked it, most-picked first. */
export type TagCount = { tag: ReviewTag; label: string; count: number }
