import type { MessageType } from "@iedora/tutor-db/enums"
import type { Kysely } from "kysely"

import type { TutorDB } from "../schema"

type DB = Kysely<TutorDB>

/** The tutor<->student conversation id, throwing if none exists. */
export async function conversationId(
  db: DB,
  tutorId: string,
  studentId: string,
): Promise<string> {
  const row = await db
    .selectFrom("conversation")
    .select("id")
    .where("tutorId", "=", tutorId)
    .where("studentId", "=", studentId)
    .executeTakeFirstOrThrow()
  return row.id
}

/** The tutor<->student conversation id, or null. */
export async function findConversationId(
  db: DB,
  tutorId: string,
  studentId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("conversation")
    .select("id")
    .where("tutorId", "=", tutorId)
    .where("studentId", "=", studentId)
    .executeTakeFirst()
  return row?.id ?? null
}

/** Find or create the single conversation for a tutor<->student pair. */
export async function ensureConversation(
  db: DB,
  tutorId: string,
  studentId: string,
): Promise<string> {
  const existing = await findConversationId(db, tutorId, studentId)
  if (existing) return existing
  const created = await db
    .insertInto("conversation")
    .values({ tutorId, studentId })
    .returning("id")
    .executeTakeFirstOrThrow()
  return created.id
}

export async function bumpConversation(db: DB, convId: string) {
  await db
    .updateTable("conversation")
    .set({ lastMessageAt: new Date() })
    .where("id", "=", convId)
    .execute()
}

/** Post a system message into a conversation and bump its activity time. */
export async function postSystem(
  db: DB,
  convId: string,
  msg: { body: string; type?: MessageType; payload?: string },
) {
  await db
    .insertInto("message")
    .values({
      conversationId: convId,
      senderType: "system",
      type: msg.type ?? "system",
      body: msg.body,
      ...(msg.payload ? { payload: msg.payload } : {}),
    })
    .execute()
  await bumpConversation(db, convId)
}
