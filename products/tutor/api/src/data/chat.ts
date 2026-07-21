import type { ChatSummaryDTO, SentMessageDTO, ThreadDTO } from "#contracts/chat"
import { RANK_EMOJI, RANK_LABEL } from "#db/domain/pricing"
import type { RankTier, SenderType } from "#db/enums"
import type { Kysely } from "kysely"

import type { TutorDB } from "../schema.ts"

type DB = Kysely<TutorDB>

/** The caller's side in a conversation, or null if they aren't a party to it.
 *  Derived from the principal — the client never supplies its own sender side. */
export async function senderFor(
  db: DB,
  conversationId: string,
  userId: string,
): Promise<SenderType | null> {
  const conv = await db
    .selectFrom("conversation")
    .select(["studentId", "tutorId"])
    .where("id", "=", conversationId)
    .executeTakeFirst()
  if (!conv) return null
  const student = await db
    .selectFrom("student")
    .select("id")
    .where("userId", "=", userId)
    .executeTakeFirst()
  if (student && student.id === conv.studentId) return "student"
  const tutor = await db
    .selectFrom("tutor")
    .select("id")
    .where("userId", "=", userId)
    .executeTakeFirst()
  if (tutor && tutor.id === conv.tutorId) return "tutor"
  return null
}

export async function insertMessage(
  db: DB,
  input: { conversationId: string; senderType: SenderType; body: string },
): Promise<SentMessageDTO> {
  const row = await db
    .insertInto("message")
    .values({
      conversationId: input.conversationId,
      senderType: input.senderType,
      type: "text",
      body: input.body,
    })
    .returning(["id", "body"])
    .executeTakeFirstOrThrow()
  await db
    .updateTable("conversation")
    .set({ lastMessageAt: new Date() })
    .where("id", "=", input.conversationId)
    .execute()
  return { id: row.id, body: row.body ?? input.body }
}

function rankLabel(tier: RankTier | null): string {
  return tier ? `${RANK_EMOJI[tier]} ${RANK_LABEL[tier]}` : ""
}

function subjectLabel(name: string | null, level: string | null): string {
  if (!name) return ""
  return level ? `${level} ${name}` : name
}

function initialOf(name: string): string {
  const last = name.trim().split(/\s+/).pop() ?? name
  return (last.charAt(0) || "?").toUpperCase()
}

export async function listConversations(db: DB, studentId: string): Promise<ChatSummaryDTO[]> {
  const rows = await db
    .selectFrom("conversation as c")
    .innerJoin("tutor as t", "t.id", "c.tutorId")
    .leftJoin("qualification as q", "q.tutorId", "t.id")
    .leftJoin("subject as s", "s.id", "q.subjectId")
    .leftJoin("rank as r", "r.id", "q.rankId")
    .where("c.studentId", "=", studentId)
    .select([
      "c.id as id",
      "t.displayName as tutorName",
      "s.name as subjectName",
      "s.level as subjectLevel",
      "r.tier as rankTier",
    ])
    .orderBy("c.lastMessageAt", "desc")
    .execute()

  const seen = new Set<string>()
  const unique = rows.filter((r) => !seen.has(r.id) && seen.add(r.id))
  if (unique.length === 0) return []

  const previews = await db
    .selectFrom("message")
    .select(["conversationId", "body", "type", "payload"])
    .where(
      "conversationId",
      "in",
      unique.map((r) => r.id),
    )
    .orderBy("createdAt", "desc")
    .execute()

  const previewByConv = new Map<string, string>()
  for (const p of previews) {
    if (previewByConv.has(p.conversationId)) continue
    const payload = (p.payload ?? {}) as Record<string, string>
    previewByConv.set(p.conversationId, p.body ?? payload.title ?? "New activity")
  }

  return unique.map((r) => ({
    id: r.id,
    name: r.tutorName,
    initial: initialOf(r.tutorName),
    subject: subjectLabel(r.subjectName, r.subjectLevel),
    rank: rankLabel(r.rankTier),
    preview: previewByConv.get(r.id) ?? "",
    unread: 0,
  }))
}

export async function getThread(
  db: DB,
  conversationId: string,
  studentId: string,
): Promise<ThreadDTO | undefined> {
  const header = await db
    .selectFrom("conversation as c")
    .innerJoin("tutor as t", "t.id", "c.tutorId")
    .leftJoin("qualification as q", "q.tutorId", "t.id")
    .leftJoin("subject as s", "s.id", "q.subjectId")
    .leftJoin("rank as r", "r.id", "q.rankId")
    .where("c.id", "=", conversationId)
    .where("c.studentId", "=", studentId)
    .select([
      "c.id as id",
      "t.displayName as tutorName",
      "s.name as subjectName",
      "s.level as subjectLevel",
      "r.tier as rankTier",
    ])
    .executeTakeFirst()
  if (!header) return undefined

  const messages = await db
    .selectFrom("message")
    .select(["id", "senderType", "type", "body", "payload"])
    .where("conversationId", "=", conversationId)
    .orderBy("createdAt", "asc")
    .execute()

  return {
    id: header.id,
    name: header.tutorName,
    initial: initialOf(header.tutorName),
    subject: subjectLabel(header.subjectName, header.subjectLevel),
    rank: rankLabel(header.rankTier),
    repliesIn: "usually replies in 1h",
    messages: messages.map((m) => ({
      id: m.id,
      senderType: m.senderType,
      type: m.type,
      body: m.body,
      payload: m.payload as Record<string, unknown> | null,
    })),
  }
}

// Notification proxy: conversations whose most recent message came from the other
// party. `role` is the caller's own side (student/tutor); `col`/`id` scope to their
// conversations. Both derived from the verified principal, never the client.
export async function getUnreadCount(
  db: DB,
  scope: { col: "studentId" | "tutorId"; id: string; role: "student" | "tutor" },
): Promise<number> {
  const convs = await db
    .selectFrom("conversation")
    .select("id")
    .where(scope.col, "=", scope.id)
    .execute()
  if (convs.length === 0) return 0

  const latest = await db
    .selectFrom("message")
    .select(["conversationId", "senderType"])
    .where(
      "conversationId",
      "in",
      convs.map((c) => c.id),
    )
    .orderBy("createdAt", "desc")
    .execute()

  const seen = new Set<string>()
  let count = 0
  for (const m of latest) {
    if (seen.has(m.conversationId)) continue
    seen.add(m.conversationId)
    if (m.senderType !== scope.role) count++
  }
  return count
}
