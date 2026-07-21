import { z } from "zod"

// Wire contracts for the tutor's own settings pages (profile text, subjects &
// rates, featured reviews, pending-change banner). Tutor-scoped; the service
// resolves the tutor from the Bearer principal. Dates are ISO strings.

// Rate guardrails (pennies): a fat-finger can't set £0 or £9999 a lesson.
export const MIN_RATE_PENNIES = 500
export const MAX_RATE_PENNIES = 50000

export const updateProfileInput = z.object({
  tagline: z.string().trim().max(240),
  bio: z.string().trim().max(3000),
  teachingStyle: z.string().trim().max(3000),
})
export const updateRateInput = z.object({
  qualificationId: z.string().min(1),
  ratePennies: z.number().int().min(MIN_RATE_PENNIES).max(MAX_RATE_PENNIES),
})
export const addQualificationInput = z.object({ subjectId: z.string().min(1) })
export const removeQualificationInput = z.object({ qualificationId: z.string().min(1) })
export const toggleReviewPinInput = z.object({
  reviewId: z.string().min(1),
  pinned: z.boolean(),
})

export interface PendingChangeDTO {
  id: string
  kind: string
  summary: string
  createdAt: string
}

export interface TutorProfileDTO {
  displayName: string
  tagline: string
  bio: string
  teachingStyle: string
}

export interface TutorQualificationDTO {
  qualificationId: string
  subject: string
  rank: string
  commissionPct: number
  pricePennies: number
  defaultPennies: number
  custom: boolean
  removable: boolean
}

export interface SubjectOptionDTO {
  subjectId: string
  subject: string
  defaultPennies: number
}

export interface QualificationEditorDTO {
  offered: TutorQualificationDTO[]
  available: SubjectOptionDTO[]
}

export interface SettingsReviewDTO {
  id: string
  studentName: string
  comment: string
  rating: number
  createdAt: string
  pinned: boolean
}
