import { PAYMENT_DEADLINE_HOURS, RELEASE_CUTOFF_HOURS } from "#db/domain/status"
import type { InngestFunction } from "inngest"

import { autoReleaseLesson, chargeLessonOffSession, requestOneOffPayment } from "../data/payments"
import type { TutorDeps } from "../deps"
import { openLessonRoom, ROOM_OPENS_MIN_BEFORE } from "../features/lessons/lessons.room"
import { inngest, lessonScheduled } from "../lib/inngest"

const MS = 60_000
const HOUR_MS = 60 * MS

/**
 * The tutor service's durable timers, bound to `deps` at boot. Delivered over an
 * outbound Inngest connect() worker (the service is internal, so no inbound HTTP).
 * Each lesson owns its own timer: `sleepUntil` survives restarts, and a
 * `lesson/cancelled` (a reschedule emits one before re-scheduling) cancels the run.
 */
export function makeFunctions(deps: TutorDeps): InngestFunction.Any[] {
  const db = deps.db.db

  // One timer per lesson that opens the LessonSpace classroom ~10 min before start.
  const openLessonRoomFn = inngest.createFunction(
    {
      id: "open-lesson-room",
      triggers: [lessonScheduled],
      cancelOn: [{ event: "lesson/cancelled", if: "event.data.lessonId == async.data.lessonId" }],
    },
    async ({ event, step }) => {
      const { lessonId, startsAtUtc } = event.data as { lessonId: string; startsAtUtc: string }
      const openAt = new Date(new Date(startsAtUtc).getTime() - ROOM_OPENS_MIN_BEFORE * MS)
      await step.sleepUntil("ten-min-before", openAt)
      const result = await step.run("open-room", async () => await openLessonRoom(deps, lessonId))
      return { lessonId, result }
    },
  )

  // One timer per lesson: sleep to the payment deadline, settle, and — if that
  // didn't work — sleep to the release cutoff and free the slot.
  const settleLessonPayment = inngest.createFunction(
    {
      id: "settle-lesson-payment",
      triggers: [lessonScheduled],
      cancelOn: [{ event: "lesson/cancelled", if: "event.data.lessonId == async.data.lessonId" }],
    },
    async ({ event, step }) => {
      const { lessonId, startsAtUtc, mode } = event.data as {
        lessonId: string
        startsAtUtc: string
        mode: "recurring" | "one_off"
      }
      const startsAt = new Date(startsAtUtc).getTime()

      const deadline = new Date(startsAt - PAYMENT_DEADLINE_HOURS[mode] * HOUR_MS)
      await step.sleepUntil("payment-deadline", deadline)

      const outcome = await step.run("settle", async () =>
        mode === "recurring"
          ? await chargeLessonOffSession(db, deps.billing, lessonId)
          : await requestOneOffPayment(db, lessonId),
      )

      if (outcome.result === "paid") return { lessonId, outcome }

      const releaseAt = new Date(startsAt - RELEASE_CUTOFF_HOURS * HOUR_MS)
      await step.sleepUntil("recovery-window", releaseAt)
      const released = await step.run("auto-release", async () => await autoReleaseLesson(db, lessonId))

      return { lessonId, outcome, released }
    },
  )

  return [openLessonRoomFn, settleLessonPayment]
}
