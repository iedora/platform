import type { Kysely } from "kysely"

import { conflict, notFound } from "../errors"
import type { TutorDB } from "../schema"

type DB = Kysely<TutorDB>

type ChangeRow = { id: string; tutorId: string; kind: string; payload: Record<string, unknown> }

// Apply an approved change to the real tables. Each kind re-checks its invariants.
async function applyChange(db: DB, change: ChangeRow): Promise<void> {
  const p = change.payload

  if (change.kind === "profile") {
    await db
      .updateTable("tutor")
      .set({
        tagline: (p.tagline as string) || null,
        bio: (p.bio as string) || null,
        teachingStyle: (p.teachingStyle as string) || null,
      })
      .where("id", "=", change.tutorId)
      .execute()
    return
  }

  if (change.kind === "rate") {
    await db
      .updateTable("qualification")
      .set({ ratePennies: p.ratePennies as number })
      .where("id", "=", p.qualificationId as string)
      .where("tutorId", "=", change.tutorId)
      .execute()
    return
  }

  if (change.kind === "add_subject") {
    const subjectId = p.subjectId as string
    const existing = await db
      .selectFrom("qualification")
      .select("id")
      .where("tutorId", "=", change.tutorId)
      .where("subjectId", "=", subjectId)
      .executeTakeFirst()
    if (existing) return
    const rank = await db
      .selectFrom("rank")
      .select("id")
      .where("tier", "=", "bronze")
      .executeTakeFirstOrThrow()
    await db
      .insertInto("qualification")
      .values({ tutorId: change.tutorId, subjectId, rankId: rank.id, verified: false })
      .execute()
    return
  }

  if (change.kind === "remove_subject") {
    const qualificationId = p.qualificationId as string
    const [lesson, review] = await Promise.all([
      db.selectFrom("lesson").select("id").where("qualificationId", "=", qualificationId).executeTakeFirst(),
      db.selectFrom("review").select("id").where("qualificationId", "=", qualificationId).executeTakeFirst(),
    ])
    if (lesson || review) {
      throw conflict("This subject now has lessons or reviews, so it can't be removed.")
    }
    await db
      .deleteFrom("qualification")
      .where("id", "=", qualificationId)
      .where("tutorId", "=", change.tutorId)
      .execute()
    return
  }

  throw conflict(`Unknown change kind: ${change.kind}`)
}

export async function approveChange(db: DB, changeId: string): Promise<{ approved: true }> {
  const change = await db
    .selectFrom("profileChange")
    .select(["id", "tutorId", "kind", "payload"])
    .where("id", "=", changeId)
    .where("status", "=", "pending")
    .executeTakeFirst()
  if (!change) throw notFound()

  await applyChange(db, {
    id: change.id,
    tutorId: change.tutorId,
    kind: change.kind,
    payload: change.payload as Record<string, unknown>,
  })

  await db
    .updateTable("profileChange")
    .set({ status: "approved", resolvedAt: new Date() })
    .where("id", "=", change.id)
    .execute()
  return { approved: true }
}

export async function rejectChange(
  db: DB,
  changeId: string,
  note: string | undefined,
): Promise<{ rejected: true }> {
  const res = await db
    .updateTable("profileChange")
    .set({ status: "rejected", resolvedAt: new Date(), reviewerNote: note ?? null })
    .where("id", "=", changeId)
    .where("status", "=", "pending")
    .executeTakeFirst()
  if (!res.numUpdatedRows) throw notFound()
  return { rejected: true }
}
