import type { ChangeKind } from "@iedora/product-tutor/types"

// View types for the tutor-settings editors. The reads themselves now live in
// services/tutor; these shapes are what the pages/components + the BFF wrappers
// (lib/api/tutor-settings) consume.

export type PendingChange = {
  id: string
  kind: ChangeKind
  summary: string
  createdAt: Date
}

export type TutorProfile = {
  displayName: string
  tagline: string
  bio: string
  teachingStyle: string
}

export type TutorQualification = {
  qualificationId: string
  subject: string
  /** Rank label, e.g. "Elite". Drives the commission the tutor pays. */
  rank: string
  /** Platform commission at this rank, as a whole percent (e.g. 12). */
  commissionPct: number
  /** Effective price a student pays: the tutor's rate, or the subject default. */
  pricePennies: number
  /** The subject's default, shown as a hint when the tutor hasn't set their own. */
  defaultPennies: number
  custom: boolean
  /** False when lessons already reference it, so it can't be safely deleted. */
  removable: boolean
}

export type SubjectOption = {
  subjectId: string
  subject: string
  defaultPennies: number
}

export type QualificationEditorData = {
  offered: TutorQualification[]
  available: SubjectOption[]
}

export type SettingsReview = {
  id: string
  studentName: string
  comment: string
  rating: number
  createdAt: Date
  pinned: boolean
}
