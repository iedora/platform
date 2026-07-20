import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type {
  CancelLessonResult,
  LeaveReviewInput,
  MarkNoShowInput,
} from "@iedora/product-tutor/contracts/lessons"
import type { ProgressionResult } from "@iedora/product-tutor/contracts/progression"

// The lesson mutations, through the service. The state machine, gamification
// engine, refunds and chat system-messages all run server-side now; these just
// forward the call and relay the progression payload the client celebrates.

const post = <T>(path: string, body: unknown) =>
  apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

export function completeLesson(lessonId: string): Promise<ProgressionResult | null> {
  return post<ProgressionResult | null>("/api/lessons/complete", { lessonId })
}

export function cancelLesson(input: { lessonId: string; as: "tutor" | "student" }): Promise<CancelLessonResult> {
  return post<CancelLessonResult>("/api/lessons/cancel", input)
}

export function markNoShow(input: MarkNoShowInput): Promise<{ ok: true }> {
  return post<{ ok: true }>("/api/lessons/no-show", input)
}

export function leaveReview(input: LeaveReviewInput): Promise<ProgressionResult> {
  return post<ProgressionResult>("/api/lessons/review", input)
}

/** The viewer's LessonSpace URL (opened on demand). Role-scoped server-side; the
 *  service resolves tutor/student from the Bearer principal. */
export function getRoomUrl(lessonId: string): Promise<{ url: string }> {
  return apiJson<{ url: string }>(`/api/lessons/${encodeURIComponent(lessonId)}/room`)
}
