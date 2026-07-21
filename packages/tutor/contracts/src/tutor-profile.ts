// Wire contracts for the public tutor-profile surface (the /t/[slug] landing page,
// its reviews page, and the sitemap). Self-contained + JSON-safe: dates are ISO
// strings, tags are their raw string values, rank/price arrive pre-formatted from
// the service. The web-side api wrapper reconstructs the richer view types
// (Date, ReviewTag) the components already use.

export interface TutorStats {
  lessonsTaught: number
  reviewCount: number
  rating: number | null
  superTutor: boolean
}

export interface TutorHighlight {
  label: string
  body: string
}

/** A weekly availability rule in the tutor's wall-clock zone. */
export interface AvailabilityRule {
  weekday: number // 0 = Sunday .. 6 = Saturday
  startTime: string // "HH:mm[:ss]"
  endTime: string
}

export interface BookableSubject {
  qualificationId: string
  subjectId: string
  subject: string
  rank: string // pre-formatted "emoji Label"
  pricePennies: number
  price: string // pre-formatted, e.g. "£24"
}

export interface TutorBookingDTO {
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

export interface TutorReviewDTO {
  id: string
  rating: number
  comment: string
  tags: string[] // raw ReviewTag values
  studentName: string
  subject: string
  createdAt: string // ISO
  pinned: boolean
}

/** Counts for 5★ down to 1★, for the distribution bars. */
export type RatingBreakdown = Record<"1" | "2" | "3" | "4" | "5", number>

/** A tag and how many parents picked it, most-picked first. */
export interface TagCount {
  tag: string
  label: string
  count: number
}

export interface TutorReviewsDTO {
  reviews: TutorReviewDTO[]
  breakdown: RatingBreakdown
  tags: TagCount[]
}

/** GET /public/tutors/by-slug/:slug → the tutor's id (or 404). */
export interface TutorIdDTO {
  id: string
}

/** GET /public/tutor-slugs → every public landing slug (for the sitemap). */
export interface PublicSlugsDTO {
  slugs: string[]
}
