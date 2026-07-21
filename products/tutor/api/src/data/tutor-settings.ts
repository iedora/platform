import type {
  PendingChangeDTO,
  QualificationEditorDTO,
  SettingsReviewDTO,
  SubjectOptionDTO,
  TutorProfileDTO,
  TutorQualificationDTO,
} from "#contracts/tutor-settings"
import { commissionPct, RANK_LABEL } from "#db/domain/pricing"
import type { RankTier } from "#db/enums"
import type { Kysely } from "kysely"

import type { TutorDB } from "../schema.ts"

type DB = Kysely<TutorDB>

function subjectLabel(name: string, level: string | null): string {
  return level ? `${level} ${name}` : name
}

export async function getTutorPendingChanges(db: DB, tutorId: string): Promise<PendingChangeDTO[]> {
  const rows = await db
    .selectFrom("profileChange")
    .select(["id", "kind", "summary", "createdAt"])
    .where("tutorId", "=", tutorId)
    .where("status", "=", "pending")
    .orderBy("createdAt", "desc")
    .execute()
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    summary: r.summary,
    createdAt: new Date(r.createdAt).toISOString(),
  }))
}

export async function getTutorProfile(db: DB, tutorId: string): Promise<TutorProfileDTO | null> {
  const row = await db
    .selectFrom("tutor")
    .select(["displayName", "tagline", "bio", "teachingStyle"])
    .where("id", "=", tutorId)
    .executeTakeFirst()
  if (!row) return null
  return {
    displayName: row.displayName,
    tagline: row.tagline ?? "",
    bio: row.bio ?? "",
    teachingStyle: row.teachingStyle ?? "",
  }
}

export async function getTutorQualifications(db: DB, tutorId: string): Promise<QualificationEditorDTO> {
  const [quals, subjects, usedRows] = await Promise.all([
    db
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
      .orderBy("s.name")
      .orderBy("s.level")
      .execute(),
    db
      .selectFrom("subject")
      .select(["id as subjectId", "name", "level", "baseRatePennies"])
      .orderBy("name")
      .orderBy("level")
      .execute(),
    db
      .selectFrom("lesson")
      .select("qualificationId")
      .where("tutorId", "=", tutorId)
      .where("qualificationId", "is not", null)
      .execute(),
  ])

  const used = new Set(usedRows.map((r) => r.qualificationId))
  const offeredSubjectIds = new Set(quals.map((q) => q.subjectId))

  const offered: TutorQualificationDTO[] = quals.map((q) => ({
    qualificationId: q.qualificationId,
    subject: subjectLabel(q.subjectName, q.subjectLevel),
    rank: RANK_LABEL[q.rankTier as RankTier],
    commissionPct: commissionPct(q.rankTier as RankTier),
    pricePennies: q.ratePennies ?? q.baseRatePennies,
    defaultPennies: q.baseRatePennies,
    custom: q.ratePennies !== null,
    removable: !used.has(q.qualificationId),
  }))

  const available: SubjectOptionDTO[] = subjects
    .filter((s) => !offeredSubjectIds.has(s.subjectId))
    .map((s) => ({
      subjectId: s.subjectId,
      subject: subjectLabel(s.name, s.level),
      defaultPennies: s.baseRatePennies,
    }))

  return { offered, available }
}

export async function getTutorSettingsReviews(db: DB, tutorId: string): Promise<SettingsReviewDTO[]> {
  const rows = await db
    .selectFrom("review as rv")
    .innerJoin("qualification as q", "q.id", "rv.qualificationId")
    .innerJoin("student as st", "st.id", "rv.studentId")
    .where("q.tutorId", "=", tutorId)
    .where("rv.comment", "is not", null)
    .select([
      "rv.id as id",
      "rv.rating as rating",
      "rv.comment as comment",
      "rv.createdAt as createdAt",
      "rv.pinned as pinned",
      "st.displayName as studentName",
    ])
    .orderBy("rv.pinned", "desc")
    .orderBy("rv.createdAt", "desc")
    .execute()
  return rows.map((r) => ({
    id: r.id,
    studentName: r.studentName,
    comment: r.comment ?? "",
    rating: r.rating,
    createdAt: new Date(r.createdAt).toISOString(),
    pinned: r.pinned,
  }))
}
