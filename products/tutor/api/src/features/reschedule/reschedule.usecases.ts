import {
  negotiationTurn,
  STANDARD_BUFFER_MIN,
  STANDARD_DURATION_MIN,
} from "#db/domain/status"
import type { Party } from "#db/enums"
import type { Kysely } from "kysely"

import { bumpConversation, conversationId, postSystem } from "../../data/conversations.ts"
import {
  activeProposalOrThrow,
  conversationParties,
  nextReschedulableLesson,
  threadContext,
  tutorAvailability,
} from "../../data/reschedule.ts"
import type { TutorDeps } from "../../deps.ts"
import { conflict, invalid, notFound } from "../../errors.ts"
import { inngest, lessonCancelled, lessonScheduled } from "../../lib/inngest.ts"
import { generateSlots, type Slot } from "../../lib/slots.ts"
import type { TutorDB } from "../../schema.ts"

type DB = Kysely<TutorDB>

const BLOCK = STANDARD_DURATION_MIN + STANDARD_BUFFER_MIN

/** Three fresh slots from the tutor's availability, excluding `excludeIso`. */
function offerSlots(rules: Parameters<typeof generateSlots>[0]["rules"], tz: string, excludeIso?: string): Slot[] {
  return generateSlots({ rules, tz, durationMinutes: BLOCK, strideMinutes: BLOCK, days: 21 })
    .filter((s) => s.startUtc !== excludeIso)
    .slice(0, 3)
}

async function postProposal(
  db: DB,
  convId: string,
  by: Party,
  threadId: string,
  slots: Slot[],
  title: string,
  sub: string,
) {
  await db
    .insertInto("message")
    .values({
      conversationId: convId,
      senderType: by,
      type: "proposal",
      payload: JSON.stringify({ threadId, title, sub, slots }),
      refId: threadId,
    })
    .execute()
  await bumpConversation(db, convId)
}

/** Open a reschedule: resolve the next lesson, offer 3 slots, create the thread. */
export async function openReschedule(
  deps: TutorDeps,
  input: { conversationId: string; by: Party },
): Promise<{ threadId: string }> {
  const db: DB = deps.db.db

  const parties = await conversationParties(db, input.conversationId)
  if (!parties) throw notFound()

  const lesson = await nextReschedulableLesson(db, parties.tutorId, parties.studentId)
  if (!lesson) throw invalid("No upcoming lesson to reschedule.")

  const { rules, tz } = await tutorAvailability(db, parties.tutorId)
  const slots = offerSlots(rules, tz, new Date(lesson.startsAtUtc).toISOString())
  if (slots.length === 0) throw invalid("No alternative slots available.")

  const thread = await db
    .insertInto("rescheduleThread")
    .values({ lessonId: lesson.id, status: "open", openedBy: input.by })
    .returning("id")
    .executeTakeFirstOrThrow()

  await db
    .insertInto("timeProposal")
    .values({
      threadId: thread.id,
      proposedBy: input.by,
      slots: JSON.stringify(slots.map((s) => s.startUtc)),
      isActive: true,
    })
    .execute()

  await db
    .updateTable("lesson")
    .set({ negotiation: negotiationTurn(input.by) })
    .where("id", "=", lesson.id)
    .execute()

  const convId = await conversationId(db, parties.tutorId, parties.studentId)
  const sub = input.by === "student" ? "Student suggested 3 times" : "Tutor suggested 3 times"
  await postProposal(db, convId, input.by, thread.id, slots, "Reschedule · pick a time", sub)

  return { threadId: thread.id }
}

/** Counter with new times: supersede the active proposal, flip the turn back. */
export async function counterReschedule(
  deps: TutorDeps,
  input: { threadId: string; by: Party },
): Promise<{ conversationId: string }> {
  const db: DB = deps.db.db
  const ctx = await threadContext(db, input.threadId)
  if (ctx.threadStatus !== "open") throw conflict("This reschedule is already resolved.")

  const { rules, tz } = await tutorAvailability(db, ctx.tutorId)
  const slots = offerSlots(rules, tz)
  if (slots.length === 0) throw invalid("No alternative slots available.")

  await db
    .updateTable("timeProposal")
    .set({ isActive: false })
    .where("threadId", "=", input.threadId)
    .where("isActive", "=", true)
    .execute()

  await db
    .insertInto("timeProposal")
    .values({
      threadId: input.threadId,
      proposedBy: input.by,
      slots: JSON.stringify(slots.map((s) => s.startUtc)),
      isActive: true,
    })
    .execute()

  await db
    .updateTable("lesson")
    .set({ negotiation: negotiationTurn(input.by) })
    .where("id", "=", ctx.lessonId)
    .execute()

  const convId = await conversationId(db, ctx.tutorId, ctx.studentId)
  const sub = input.by === "student" ? "Student suggested other times" : "Tutor suggested other times"
  await postProposal(db, convId, input.by, input.threadId, slots, "Reschedule · new times", sub)

  return { conversationId: convId }
}

/** Confirm a slot: only the awaited party may confirm. Ends the negotiation. */
export async function confirmReschedule(
  deps: TutorDeps,
  input: { threadId: string; by: Party; startUtc: string; label: string },
): Promise<{ conversationId: string }> {
  const db: DB = deps.db.db
  const ctx = await threadContext(db, input.threadId)
  if (ctx.threadStatus !== "open") throw conflict("This reschedule is already resolved.")

  const active = await activeProposalOrThrow(db, input.threadId)
  if (active.proposedBy === input.by) {
    throw conflict("It's the other party's turn — you can't confirm your own suggestion.")
  }

  await db
    .updateTable("lesson")
    .set({ startsAtUtc: new Date(input.startUtc), negotiation: "none" })
    .where("id", "=", ctx.lessonId)
    .execute()

  // The old charge timer was keyed to the old time — cancel it and start a new
  // one, unless the lesson is already paid (payment carries over).
  const lesson = await db
    .selectFrom("lesson")
    .select(["id", "status", "mode"])
    .where("id", "=", ctx.lessonId)
    .executeTakeFirstOrThrow()

  await inngest.send(lessonCancelled.create({ lessonId: ctx.lessonId }))
  if (lesson.status !== "paid") {
    await inngest.send(
      lessonScheduled.create({
        lessonId: ctx.lessonId,
        startsAtUtc: new Date(input.startUtc).toISOString(),
        mode: lesson.mode,
      }),
    )
  }

  await db
    .updateTable("rescheduleThread")
    .set({ status: "confirmed", resolvedAt: new Date() })
    .where("id", "=", input.threadId)
    .execute()

  await db
    .updateTable("timeProposal")
    .set({ isActive: false })
    .where("threadId", "=", input.threadId)
    .execute()

  await db
    .insertInto("lessonEvent")
    .values({
      lessonId: ctx.lessonId,
      fromStatus: ctx.lessonStatus,
      toStatus: ctx.lessonStatus,
      reason: `Rescheduled to ${input.label}`,
    })
    .execute()

  const convId = await conversationId(db, ctx.tutorId, ctx.studentId)
  await postSystem(db, convId, { body: `Rescheduled to ${input.label}` })

  return { conversationId: convId }
}
