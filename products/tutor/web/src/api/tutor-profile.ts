import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type {
  TutorBookingDTO,
  TutorReviewsDTO,
} from "@iedora/product-tutor/contracts/tutor-profile"
import type { RankTier } from "@iedora/product-tutor/enums"

import type { AvailabilityRule } from "@iedora/product-tutor/features/booking/booking.slots"
import type {
  BookableSubject,
  RatingBreakdown,
  TagCount,
  TutorBooking,
  TutorReview,
  TutorStats,
} from "@iedora/product-tutor/features/booking/booking.queries"
import type { ReviewTag } from "@iedora/product-tutor/enums"

// Web-side BFF wrappers for the public tutor-profile surface. Each calls the tutor
// service via apiJson and reconstructs the exact view types the pages/components
// already consume (Date, ReviewTag) — so the UI is untouched. Server-only.

const enc = encodeURIComponent

export async function getTutorIdBySlug(slug: string): Promise<string | undefined> {
  try {
    const { id } = await apiJson<{ id: string }>(`/public/tutors/by-slug/${enc(slug)}`)
    return id
  } catch {
    return undefined // 404 → not found (matches the old query's undefined)
  }
}

export async function listPublicTutorSlugs(): Promise<string[]> {
  const { slugs } = await apiJson<{ slugs: string[] }>(`/public/tutor-slugs`)
  return slugs
}

export async function getTutorBooking(tutorId: string): Promise<TutorBooking | undefined> {
  try {
    const dto = await apiJson<TutorBookingDTO>(`/public/tutors/${enc(tutorId)}/booking`)
    // The wire DTO is structurally the view type (all JSON-safe already).
    return {
      ...dto,
      // Cast the pre-formatted subject rows + rules back to their view types.
      subjects: dto.subjects as BookableSubject[],
      availability: dto.availability as AvailabilityRule[],
      stats: dto.stats as TutorStats,
    }
  } catch {
    return undefined
  }
}

export async function getTutorReviews(tutorId: string): Promise<{
  reviews: TutorReview[]
  breakdown: RatingBreakdown
  tags: TagCount[]
}> {
  const dto = await apiJson<TutorReviewsDTO>(`/public/tutors/${enc(tutorId)}/reviews`)
  return {
    reviews: dto.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      tags: r.tags as ReviewTag[],
      studentName: r.studentName,
      subject: r.subject,
      createdAt: new Date(r.createdAt),
      pinned: r.pinned,
    })),
    // Wire keys are "1".."5" strings; the view uses numeric keys.
    breakdown: {
      1: dto.breakdown["1"],
      2: dto.breakdown["2"],
      3: dto.breakdown["3"],
      4: dto.breakdown["4"],
      5: dto.breakdown["5"],
    },
    tags: dto.tags.map((t) => ({ tag: t.tag as ReviewTag, label: t.label, count: t.count })),
  }
}
