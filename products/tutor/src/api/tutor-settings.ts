import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type {
  PendingChangeDTO,
  QualificationEditorDTO,
  SettingsReviewDTO,
  TutorProfileDTO,
} from "@iedora/product-tutor/contracts/tutor-settings"
import type { ChangeKind } from "@iedora/product-tutor/types"

import type {
  PendingChange,
  QualificationEditorData,
  SettingsReview,
  TutorProfile,
} from "@iedora/product-tutor/features/tutor-settings/tutor-settings.queries"

// Tutor-settings BFF wrappers. The tutor is resolved server-side from the Bearer;
// here we reconstruct the view types (Date, ChangeKind) the editors consume.

export async function getTutorProfile(): Promise<TutorProfile | null> {
  try {
    return await apiJson<TutorProfileDTO>("/api/settings/profile")
  } catch {
    return null
  }
}

export async function getTutorQualifications(): Promise<QualificationEditorData> {
  return apiJson<QualificationEditorDTO>("/api/settings/qualifications")
}

export async function getTutorSettingsReviews(): Promise<SettingsReview[]> {
  const { reviews } = await apiJson<{ reviews: SettingsReviewDTO[] }>("/api/settings/reviews")
  return reviews.map((r) => ({ ...r, createdAt: new Date(r.createdAt) }))
}

export async function getTutorPendingChanges(): Promise<PendingChange[]> {
  const { changes } = await apiJson<{ changes: PendingChangeDTO[] }>("/api/settings/pending-changes")
  return changes.map((c) => ({
    id: c.id,
    kind: c.kind as ChangeKind,
    summary: c.summary,
    createdAt: new Date(c.createdAt),
  }))
}

const post = <T>(path: string, body: unknown) =>
  apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

export const updateProfile = (input: { tagline: string; bio: string; teachingStyle: string }) =>
  post<{ staged: boolean }>("/api/settings/profile", input)

export const updateRate = (input: { qualificationId: string; ratePennies: number }) =>
  post<{ staged: boolean }>("/api/settings/rate", input)

export const addQualification = (subjectId: string) =>
  post<{ staged: boolean }>("/api/settings/qualifications", { subjectId })

export const removeQualification = (qualificationId: string) =>
  post<{ staged: boolean }>("/api/settings/qualifications/remove", { qualificationId })

export const toggleReviewPin = (input: { reviewId: string; pinned: boolean }) =>
  post<{ pinned: boolean }>("/api/settings/review-pin", input)
