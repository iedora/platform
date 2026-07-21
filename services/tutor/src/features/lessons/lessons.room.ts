import { isTerminal } from "@iedora/tutor-db/domain/status"
import type { Kysely } from "kysely"

import { bumpConversation, findConversationId } from "../../data/conversations"
import type { TutorDeps } from "../../deps"
import type { TutorDB } from "../../schema"

type DB = Kysely<TutorDB>

const MS = 60_000
/** How long before the lesson the classroom opens. */
export const ROOM_OPENS_MIN_BEFORE = 10
/** Grace period after the scheduled end during which the link keeps working. */
const GRACE_AFTER_MIN = 30

/**
 * Mints the LessonSpace classroom for a lesson and drops the "classroom is ready"
 * card into the chat. Idempotent: if the room is already open, or the lesson is in
 * a terminal state, it does nothing. Called by the durable timer ~10 min before the
 * lesson, and on demand from the /room route if someone clicks Join early.
 */
export async function openLessonRoom(deps: TutorDeps, lessonId: string): Promise<{ result: string }> {
  const db: DB = deps.db.db
  const lesson = await db
    .selectFrom("lesson as l")
    .innerJoin("tutor as t", "t.id", "l.tutorId")
    .innerJoin("student as s", "s.id", "l.studentId")
    .where("l.id", "=", lessonId)
    .select([
      "l.id as id",
      "l.tutorId as tutorId",
      "l.studentId as studentId",
      "l.seriesId as seriesId",
      "l.startsAtUtc as startsAtUtc",
      "l.durationMin as durationMin",
      "l.bufferMin as bufferMin",
      "l.status as status",
      "l.roomTutorUrl as roomTutorUrl",
      "t.displayName as tutorName",
      "s.displayName as studentName",
    ])
    .executeTakeFirst()

  if (!lesson) return { result: "missing" }
  if (isTerminal(lesson.status)) return { result: "skipped" }
  if (lesson.roomTutorUrl) return { result: "already-open" }

  const start = new Date(lesson.startsAtUtc).getTime()
  const notBefore = new Date(start - ROOM_OPENS_MIN_BEFORE * MS).toISOString()
  const notAfter = new Date(start + (lesson.durationMin + lesson.bufferMin + GRACE_AFTER_MIN) * MS).toISOString()
  // Recurring pairs share a room so the whiteboard and files persist week to week.
  const spaceId = `lesson-${lesson.seriesId ?? lesson.id}`
  const name = `${lesson.studentName} & ${lesson.tutorName}`

  // Per-participant URLs: the tutor's carries leader (host) rights and is stored
  // apart from the student's so the /room route can hand each person only theirs.
  const [tutorUrl, studentUrl] = await Promise.all([
    deps.launchSpace({
      spaceId,
      name,
      user: { id: lesson.tutorId, name: lesson.tutorName, leader: true },
      notBefore,
      notAfter,
    }),
    deps.launchSpace({
      spaceId,
      name,
      user: { id: lesson.studentId, name: lesson.studentName, leader: false },
      notBefore,
      notAfter,
    }),
  ])

  await db
    .updateTable("lesson")
    .set({ roomTutorUrl: tutorUrl, roomUrl: studentUrl })
    .where("id", "=", lessonId)
    .execute()

  // Pop the card into the pair's chat. Both see one card; the Join button routes each
  // of them through /room/[lessonId], which redirects to their own URL by role.
  const convId = await findConversationId(db, lesson.tutorId, lesson.studentId)
  if (convId) {
    await db
      .insertInto("message")
      .values({
        conversationId: convId,
        senderType: "system",
        type: "lesson_room",
        body: "Your classroom is ready",
        payload: JSON.stringify({
          lessonId: lesson.id,
          startsAtUtc: new Date(lesson.startsAtUtc).toISOString(),
        }),
      })
      .execute()
    await bumpConversation(db, convId)
  }

  return { result: "opened" }
}

/** The viewer's own room URL, opening the room on demand. Role decides which URL
 *  (the tutor's carries leader rights); the other party's is never returned. */
export type RoomUrlResult =
  | { status: "ok"; url: string }
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "not-ready" }

export async function roomUrlFor(
  deps: TutorDeps,
  lessonId: string,
  principal: { tutorId?: string | null; studentId?: string | null },
): Promise<RoomUrlResult> {
  const db: DB = deps.db.db
  const load = () =>
    db
      .selectFrom("lesson")
      .select(["id", "tutorId", "studentId", "roomUrl", "roomTutorUrl"])
      .where("id", "=", lessonId)
      .executeTakeFirst()

  let lesson = await load()
  if (!lesson) return { status: "not-found" }

  const role =
    principal.tutorId && principal.tutorId === lesson.tutorId
      ? "tutor"
      : principal.studentId && principal.studentId === lesson.studentId
        ? "student"
        : null
  if (!role) return { status: "forbidden" }

  if (!lesson.roomTutorUrl || !lesson.roomUrl) {
    await openLessonRoom(deps, lessonId)
    lesson = await load()
  }

  const url = role === "tutor" ? lesson?.roomTutorUrl : lesson?.roomUrl
  if (!url) return { status: "not-ready" }
  return { status: "ok", url }
}
