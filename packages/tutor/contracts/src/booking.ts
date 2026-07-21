import { z } from "zod"

import type { BookableSubject, TutorStats } from "./tutor-profile"

// Wire contracts for the browse-and-book surface. The bookable-tutor list is public
// tutor data; the has-lesson gateway is student-scoped (resolved from the Bearer).

export interface BookableTutorDTO {
  id: string
  displayName: string
  university: string | null
  degree: string | null
  tagline: string | null
  avatarUrl: string | null
  subjects: BookableSubject[]
  stats: TutorStats
}

export interface HasLessonDTO {
  hasLesson: boolean
}

/* ------------------------------- booking mutations ------------------------------- */
// The student is resolved from the Bearer principal; a recurring series pins to the
// TUTOR's wall-clock (the service looks the tutor's zone up), so the web sends only
// the weekday + local time, never a timezone.

export const bookIntroInput = z.object({
  tutorId: z.uuid(),
  subjectId: z.uuid(),
  startsAtUtc: z.iso.datetime({ offset: true }),
})
export type BookIntroInput = z.infer<typeof bookIntroInput>
export interface BookIntroResult {
  conversationId: string
}

export const bookRecurringInput = z.object({
  tutorId: z.uuid(),
  qualificationId: z.uuid(),
  weekday: z.number().int().min(0).max(6),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
})
export type BookRecurringInput = z.infer<typeof bookRecurringInput>
export interface BookRecurringResult {
  conversationId: string
  count: number
}
