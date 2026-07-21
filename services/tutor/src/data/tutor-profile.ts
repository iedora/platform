import type { BookableTutorDTO } from "@iedora/tutor-contracts/booking"
import type {
  AvailabilityRule,
  BookableSubject,
  RatingBreakdown,
  TagCount,
  TutorBookingDTO,
  TutorReviewDTO,
  TutorReviewsDTO,
  TutorStats,
} from "@iedora/tutor-contracts/tutor-profile"
import { REVIEW_TAG_LABEL, type ReviewTag, type RankTier } from "@iedora/tutor-db/enums"
import {
  computePricePennies,
  formatPennies,
  isSuperTutor,
  RANK_EMOJI,
  RANK_LABEL,
} from "@iedora/tutor-db/domain/pricing"
import type { Kysely } from "kysely"

import type { TutorDB } from "../schema"

// Public tutor-profile reads, ported from the app's booking.queries. Pure data
// access over the passed Kysely handle (the service's own pool) — no singleton.
// Display values (rank badge, price) are formatted here so the web renders strings.

type DB = Kysely<TutorDB>

function subjectLabel(name: string, level: string | null): string {
  return level ? `${level} ${name}` : name
}

function toBookableSubject(row: {
  qualificationId: string
  subjectId: string
  subjectName: string
  subjectLevel: string | null
  baseRatePennies: number
  ratePennies: number | null
  rankTier: RankTier
}): BookableSubject {
  // The tutor's own rate wins; the subject's base rate is only the fallback.
  const pricePennies = computePricePennies(row.ratePennies ?? row.baseRatePennies)
  return {
    qualificationId: row.qualificationId,
    subjectId: row.subjectId,
    subject: subjectLabel(row.subjectName, row.subjectLevel),
    rank: `${RANK_EMOJI[row.rankTier]} ${RANK_LABEL[row.rankTier]}`,
    pricePennies,
    price: formatPennies(pricePennies),
  }
}

async function getTutorStats(db: DB, tutorIds: string[]): Promise<Map<string, TutorStats>> {
  const stats = new Map<string, TutorStats>()
  if (tutorIds.length === 0) return stats

  const [lessons, reviews, ranks] = await Promise.all([
    db
      .selectFrom("lesson")
      .select((eb) => ["tutorId", eb.fn.countAll<string>().as("n")])
      .where("tutorId", "in", tutorIds)
      .where("status", "=", "completed")
      .groupBy("tutorId")
      .execute(),
    db
      .selectFrom("review as rv")
      .innerJoin("qualification as q", "q.id", "rv.qualificationId")
      .select((eb) => [
        "q.tutorId as tutorId",
        eb.fn.countAll<string>().as("n"),
        eb.fn.avg<string>("rv.rating").as("avg"),
      ])
      .where("q.tutorId", "in", tutorIds)
      .groupBy("q.tutorId")
      .execute(),
    db
      .selectFrom("qualification as q")
      .innerJoin("rank as r", "r.id", "q.rankId")
      .select(["q.tutorId as tutorId", "r.tier as tier"])
      .where("q.tutorId", "in", tutorIds)
      .execute(),
  ])

  for (const id of tutorIds) {
    const lessonRow = lessons.find((l) => l.tutorId === id)
    const reviewRow = reviews.find((r) => r.tutorId === id)
    stats.set(id, {
      lessonsTaught: Number(lessonRow?.n ?? 0),
      reviewCount: Number(reviewRow?.n ?? 0),
      rating: reviewRow?.avg ? Math.round(Number(reviewRow.avg) * 10) / 10 : null,
      superTutor: ranks.some((r) => r.tutorId === id && isSuperTutor(r.tier)),
    })
  }
  return stats
}

/** Resolve a landing-page slug to a tutor id. */
export async function getTutorIdBySlug(db: DB, slug: string): Promise<string | undefined> {
  const row = await db
    .selectFrom("tutor")
    .select("id")
    .where("slug", "=", slug)
    .executeTakeFirst()
  return row?.id
}

/** The browse list: every tutor with their subjects + public credibility stats. */
export async function listBookableTutors(db: DB): Promise<BookableTutorDTO[]> {
  const rows = await db
    .selectFrom("tutor as t")
    .innerJoin("qualification as q", "q.tutorId", "t.id")
    .innerJoin("subject as s", "s.id", "q.subjectId")
    .innerJoin("rank as r", "r.id", "q.rankId")
    .select([
      "t.id as tutorId",
      "t.displayName as displayName",
      "t.university as university",
      "t.degree as degree",
      "t.tagline as tagline",
      "t.avatarUrl as avatarUrl",
      "q.id as qualificationId",
      "q.subjectId as subjectId",
      "s.name as subjectName",
      "s.level as subjectLevel",
      "s.baseRatePennies as baseRatePennies",
      "q.ratePennies as ratePennies",
      "r.tier as rankTier",
    ])
    .orderBy("t.displayName")
    .execute()

  const byTutor = new Map<string, BookableTutorDTO>()
  for (const row of rows) {
    const entry =
      byTutor.get(row.tutorId) ??
      byTutor
        .set(row.tutorId, {
          id: row.tutorId,
          displayName: row.displayName,
          university: row.university,
          degree: row.degree,
          tagline: row.tagline,
          avatarUrl: row.avatarUrl,
          subjects: [],
          stats: { lessonsTaught: 0, reviewCount: 0, rating: null, superTutor: false },
        })
        .get(row.tutorId)!
    entry.subjects.push(toBookableSubject(row))
  }

  const stats = await getTutorStats(db, [...byTutor.keys()])
  for (const entry of byTutor.values()) {
    entry.stats = stats.get(entry.id) ?? entry.stats
  }
  return [...byTutor.values()]
}

/** Every tutor with a public landing page, for the sitemap. */
export async function listPublicTutorSlugs(db: DB): Promise<string[]> {
  const rows = await db
    .selectFrom("tutor")
    .select("slug")
    .where("slug", "is not", null)
    .execute()
  return rows.map((r) => r.slug).filter((s): s is string => Boolean(s))
}

export async function getTutorBooking(db: DB, tutorId: string): Promise<TutorBookingDTO | undefined> {
  const tutor = await db
    .selectFrom("tutor")
    .select([
      "id",
      "displayName",
      "university",
      "degree",
      "timezone",
      "tagline",
      "bio",
      "teachingStyle",
      "avatarUrl",
      "highlights",
      "linkedinUrl",
    ])
    .where("id", "=", tutorId)
    .executeTakeFirst()
  if (!tutor) return undefined

  const quals = await db
    .selectFrom("qualification as q")
    .innerJoin("subject as s", "s.id", "q.subjectId")
    .innerJoin("rank as r", "r.id", "q.rankId")
    .where("q.tutorId", "=", tutorId)
    .select([
      "q.id as qualificationId",
      "q.subjectId as subjectId",
      "s.name as subjectName",
      "s.level as subjectLevel",
      "s.baseRatePennies as baseRatePennies",
      "q.ratePennies as ratePennies",
      "r.tier as rankTier",
    ])
    .execute()

  const availability: AvailabilityRule[] = await db
    .selectFrom("availability")
    .select(["weekday", "startTime", "endTime"])
    .where("tutorId", "=", tutorId)
    .execute()

  const stats = await getTutorStats(db, [tutor.id])

  return {
    id: tutor.id,
    displayName: tutor.displayName,
    university: tutor.university,
    degree: tutor.degree,
    tagline: tutor.tagline,
    bio: tutor.bio,
    teachingStyle: tutor.teachingStyle,
    avatarUrl: tutor.avatarUrl,
    highlights: tutor.highlights ?? [],
    linkedinUrl: tutor.linkedinUrl,
    tz: tutor.timezone,
    stats: stats.get(tutor.id) ?? {
      lessonsTaught: 0,
      reviewCount: 0,
      rating: null,
      superTutor: false,
    },
    subjects: quals.map(toBookableSubject),
    availability,
  }
}

export async function getTutorReviews(db: DB, tutorId: string): Promise<TutorReviewsDTO> {
  const rows = await db
    .selectFrom("review as rv")
    .innerJoin("qualification as q", "q.id", "rv.qualificationId")
    .innerJoin("subject as s", "s.id", "q.subjectId")
    .innerJoin("student as st", "st.id", "rv.studentId")
    .where("q.tutorId", "=", tutorId)
    .select([
      "rv.id as id",
      "rv.rating as rating",
      "rv.comment as comment",
      "rv.tags as tags",
      "rv.createdAt as createdAt",
      "rv.pinned as pinned",
      "st.displayName as studentName",
      "s.name as subjectName",
      "s.level as subjectLevel",
    ])
    .orderBy("rv.pinned", "desc")
    .orderBy("rv.createdAt", "desc")
    .execute()

  const breakdown: RatingBreakdown = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }
  const counts = new Map<ReviewTag, number>()
  const reviews: TutorReviewDTO[] = []

  for (const row of rows) {
    const star = String(Math.min(5, Math.max(1, Math.round(row.rating)))) as keyof RatingBreakdown
    breakdown[star] += 1
    for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)

    reviews.push({
      id: row.id,
      rating: row.rating,
      comment: row.comment ?? "",
      tags: row.tags,
      studentName: row.studentName,
      subject: subjectLabel(row.subjectName, row.subjectLevel),
      createdAt: row.createdAt.toISOString(),
      pinned: row.pinned,
    })
  }

  const tags: TagCount[] = [...counts.entries()]
    .map(([tag, count]) => ({ tag, label: REVIEW_TAG_LABEL[tag], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  return { reviews, breakdown, tags }
}
