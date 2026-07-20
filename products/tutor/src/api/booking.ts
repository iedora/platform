import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type {
  BookableTutorDTO,
  BookIntroInput,
  BookIntroResult,
  BookRecurringInput,
  BookRecurringResult,
  HasLessonDTO,
} from "@iedora/product-tutor/contracts/booking"

// Browse-and-book BFF wrappers. The list is public tutor data; the gateway check
// is student-scoped server-side. The DTOs are already the view shapes.
export async function listBookableTutors(): Promise<BookableTutorDTO[]> {
  const { tutors } = await apiJson<{ tutors: BookableTutorDTO[] }>("/public/bookable-tutors")
  return tutors
}

export async function hasLessonWith(tutorId: string): Promise<boolean> {
  const { hasLesson } = await apiJson<HasLessonDTO>(
    `/api/tutors/${encodeURIComponent(tutorId)}/has-lesson`,
  )
  return hasLesson
}

// Booking mutations. The service resolves the student from the Bearer principal,
// snapshots price, arms the charge timers, and — for a series — pins to the tutor's
// wall-clock, so the web sends only the identifiers + weekday/time.

export function bookIntro(input: BookIntroInput): Promise<BookIntroResult> {
  return apiJson<BookIntroResult>("/api/booking/intro", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
}

export function bookRecurring(input: BookRecurringInput): Promise<BookRecurringResult> {
  return apiJson<BookRecurringResult>("/api/booking/recurring", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
}
