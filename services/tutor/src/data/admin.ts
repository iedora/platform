import type { AdminChangeDTO } from "@iedora/tutor-contracts/admin"
import type { Kysely } from "kysely"

import type { TutorDB } from "../schema"

type DB = Kysely<TutorDB>

/** Admin membership by email (the allowlist is checked separately, in config). */
export function adminByEmail(db: DB, email: string) {
  return db.selectFrom("admin").select("id").where("email", "=", email).executeTakeFirst()
}

/** Every tutor edit awaiting review, oldest first (a simple FIFO queue). */
export async function listPendingChanges(db: DB): Promise<AdminChangeDTO[]> {
  const rows = await db
    .selectFrom("profileChange as pc")
    .innerJoin("tutor as t", "t.id", "pc.tutorId")
    .select([
      "pc.id as id",
      "pc.tutorId as tutorId",
      "t.displayName as tutorName",
      "t.slug as tutorSlug",
      "pc.kind as kind",
      "pc.summary as summary",
      "pc.payload as payload",
      "pc.createdAt as createdAt",
    ])
    .where("pc.status", "=", "pending")
    .orderBy("pc.createdAt", "asc")
    .execute()

  return rows.map((r) => ({
    id: r.id,
    tutorId: r.tutorId,
    tutorName: r.tutorName,
    tutorSlug: r.tutorSlug,
    kind: r.kind,
    summary: r.summary,
    payload: r.payload as Record<string, unknown>,
    createdAt: new Date(r.createdAt).toISOString(),
  }))
}
