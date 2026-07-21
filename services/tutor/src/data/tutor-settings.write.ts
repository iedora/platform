import { invalid, notFound } from "../errors"
import type { Kysely } from "kysely"

import type { TutorDB } from "../schema"

type DB = Kysely<TutorDB>
type ChangeKind = "profile" | "rate" | "add_subject" | "remove_subject"

function money(pennies: number): string {
  return `£${(pennies / 100).toFixed(2).replace(/\.00$/, "")}`
}

// Stage a change for admin review. Any existing pending change of the same kind +
// target is replaced, so re-editing before approval just updates the request.
async function stageChange(
  db: DB,
  args: {
    tutorId: string
    kind: ChangeKind
    payload: Record<string, unknown>
    summary: string
    target?: { key: string; value: string }
  },
): Promise<void> {
  if (args.target) {
    const rows = await db
      .selectFrom("profileChange")
      .select(["id", "payload"])
      .where("tutorId", "=", args.tutorId)
      .where("kind", "=", args.kind)
      .where("status", "=", "pending")
      .execute()
    const dupes = rows
      .filter((r) => (r.payload as Record<string, unknown>)[args.target!.key] === args.target!.value)
      .map((r) => r.id)
    if (dupes.length > 0) {
      await db.deleteFrom("profileChange").where("id", "in", dupes).execute()
    }
  } else {
    await db
      .deleteFrom("profileChange")
      .where("tutorId", "=", args.tutorId)
      .where("kind", "=", args.kind)
      .where("status", "=", "pending")
      .execute()
  }

  await db
    .insertInto("profileChange")
    .values({
      tutorId: args.tutorId,
      kind: args.kind,
      payload: JSON.stringify(args.payload),
      summary: args.summary,
    })
    .execute()
}

export async function updateProfile(
  db: DB,
  tutorId: string,
  input: { tagline: string; bio: string; teachingStyle: string },
): Promise<{ staged: boolean }> {
  const current = await db
    .selectFrom("tutor")
    .select(["tagline", "bio", "teachingStyle"])
    .where("id", "=", tutorId)
    .executeTakeFirstOrThrow()

  const changed: string[] = []
  if (input.tagline !== (current.tagline ?? "")) changed.push("card pitch")
  if (input.bio !== (current.bio ?? "")) changed.push("about")
  if (input.teachingStyle !== (current.teachingStyle ?? "")) changed.push("teaching style")
  if (changed.length === 0) return { staged: false }

  await stageChange(db, {
    tutorId,
    kind: "profile",
    payload: {
      tagline: input.tagline,
      bio: input.bio,
      teachingStyle: input.teachingStyle,
      prev: {
        tagline: current.tagline ?? "",
        bio: current.bio ?? "",
        teachingStyle: current.teachingStyle ?? "",
      },
    },
    summary: `Edited ${changed.join(", ")}`,
  })
  return { staged: true }
}

export async function updateRate(
  db: DB,
  tutorId: string,
  input: { qualificationId: string; ratePennies: number },
): Promise<{ staged: boolean }> {
  const qual = await db
    .selectFrom("qualification as q")
    .innerJoin("subject as s", "s.id", "q.subjectId")
    .select([
      "q.id as id",
      "q.ratePennies as ratePennies",
      "s.name as name",
      "s.level as level",
      "s.baseRatePennies as baseRatePennies",
    ])
    .where("q.id", "=", input.qualificationId)
    .where("q.tutorId", "=", tutorId)
    .executeTakeFirst()
  if (!qual) throw notFound()

  const subject = qual.level ? `${qual.level} ${qual.name}` : qual.name
  const prevPennies = qual.ratePennies ?? qual.baseRatePennies

  await stageChange(db, {
    tutorId,
    kind: "rate",
    target: { key: "qualificationId", value: input.qualificationId },
    payload: { qualificationId: input.qualificationId, subject, ratePennies: input.ratePennies, prevPennies },
    summary: `${subject} rate: ${money(prevPennies)} → ${money(input.ratePennies)}`,
  })
  return { staged: true }
}

export async function addQualification(
  db: DB,
  tutorId: string,
  subjectId: string,
): Promise<{ staged: boolean }> {
  const subject = await db
    .selectFrom("subject")
    .select(["id", "name", "level"])
    .where("id", "=", subjectId)
    .executeTakeFirst()
  if (!subject) throw notFound()

  const existing = await db
    .selectFrom("qualification")
    .select("id")
    .where("tutorId", "=", tutorId)
    .where("subjectId", "=", subjectId)
    .executeTakeFirst()
  if (existing) throw invalid("You already teach that subject.")

  const label = subject.level ? `${subject.level} ${subject.name}` : subject.name
  await stageChange(db, {
    tutorId,
    kind: "add_subject",
    target: { key: "subjectId", value: subjectId },
    payload: { subjectId, subject: label },
    summary: `Add ${label}`,
  })
  return { staged: true }
}

export async function removeQualification(
  db: DB,
  tutorId: string,
  qualificationId: string,
): Promise<{ staged: boolean }> {
  const qual = await db
    .selectFrom("qualification as q")
    .innerJoin("subject as s", "s.id", "q.subjectId")
    .select(["q.id as id", "s.name as name", "s.level as level"])
    .where("q.id", "=", qualificationId)
    .where("q.tutorId", "=", tutorId)
    .executeTakeFirst()
  if (!qual) throw notFound()

  const label = qual.level ? `${qual.level} ${qual.name}` : qual.name
  await stageChange(db, {
    tutorId,
    kind: "remove_subject",
    target: { key: "qualificationId", value: qualificationId },
    payload: { qualificationId, subject: label },
    summary: `Remove ${label}`,
  })
  return { staged: true }
}

// Pinning is low-stakes and reversible, so it applies immediately (no review).
export async function toggleReviewPin(
  db: DB,
  tutorId: string,
  input: { reviewId: string; pinned: boolean },
): Promise<{ pinned: boolean }> {
  const owned = await db
    .selectFrom("review as rv")
    .innerJoin("qualification as q", "q.id", "rv.qualificationId")
    .select("rv.id")
    .where("rv.id", "=", input.reviewId)
    .where("q.tutorId", "=", tutorId)
    .executeTakeFirst()
  if (!owned) throw notFound()

  await db.updateTable("review").set({ pinned: input.pinned }).where("id", "=", input.reviewId).execute()
  return { pinned: input.pinned }
}
