import { HOUR, MINUTE } from "@iedora/common"
import { createJobs, type Jobs } from "@iedora/jobs"

import { PAYMENT_DEADLINE_HOURS, RELEASE_CUTOFF_HOURS } from "#db/domain/status"

import { autoReleaseLesson, chargeLessonOffSession, requestOneOffPayment } from "../data/payments.ts"
import type { TutorDeps } from "../deps.ts"
import { openLessonRoom, ROOM_OPENS_MIN_BEFORE } from "../features/lessons/lessons.room.ts"

export type LessonMode = "recurring" | "one_off"
interface LessonTimer {
  lessonId: string
  /** ISO instant the lesson starts — timers count back from this. */
  startsAtUtc: string
  mode: LessonMode
}

// All of a lesson's timers share one key, so cancelling the lesson cancels them
// all in a single call.
const lessonKey = (lessonId: string) => `lesson:${lessonId}`

const OPEN_ROOM = "open-lesson-room"
const SETTLE_PAYMENT = "settle-lesson-payment"
const AUTO_RELEASE = "auto-release-lesson"

/**
 * The tutor job runner: durable, cancellable timers on Postgres (via
 * `@iedora/jobs`), replacing the old external Inngest worker. Handlers close over
 * `getDeps`, which the runner only calls at execution time — after `deps.jobs`
 * has been wired in index.ts.
 */
export function createTutorJobs(connectionString: string, getDeps: () => TutorDeps): Jobs {
  return createJobs({
    connectionString,
    onError: (error, job) =>
      console.error(
        JSON.stringify({ level: "error", msg: "lesson job failed", service: "iedora-tutor", job, error: String(error) }),
      ),
    handlers: {
      // Open the LessonSpace classroom ~10 min before the lesson.
      [OPEN_ROOM]: async ({ payload }) => {
        await openLessonRoom(getDeps(), (payload as { lessonId: string }).lessonId)
      },

      // Settle payment at the deadline; if it didn't go through, schedule the
      // auto-release for the recovery cutoff (the durable "sleep then retry step").
      [SETTLE_PAYMENT]: async ({ payload, schedule }) => {
        const { lessonId, startsAtUtc, mode } = payload as LessonTimer
        const deps = getDeps()
        const db = deps.db.db
        const outcome =
          mode === "recurring"
            ? await chargeLessonOffSession(db, deps.billing, lessonId)
            : await requestOneOffPayment(db, lessonId)
        if (outcome.result === "paid") return

        const releaseAt = new Date(new Date(startsAtUtc).getTime() - RELEASE_CUTOFF_HOURS * HOUR)
        await schedule({ kind: AUTO_RELEASE, runAt: releaseAt, payload: { lessonId }, key: lessonKey(lessonId) })
      },

      // Free the slot when payment never recovered.
      [AUTO_RELEASE]: async ({ payload }) => {
        await autoReleaseLesson(getDeps().db.db, (payload as { lessonId: string }).lessonId)
      },
    },
  })
}

/** Schedule a lesson's durable timers (room open + payment settle). */
export async function scheduleLessonTimers(jobs: Jobs, timer: LessonTimer): Promise<void> {
  const startsAt = new Date(timer.startsAtUtc).getTime()
  const key = lessonKey(timer.lessonId)
  await jobs.schedule({
    kind: OPEN_ROOM,
    runAt: new Date(startsAt - ROOM_OPENS_MIN_BEFORE * MINUTE),
    payload: { lessonId: timer.lessonId },
    key,
  })
  await jobs.schedule({
    kind: SETTLE_PAYMENT,
    runAt: new Date(startsAt - PAYMENT_DEADLINE_HOURS[timer.mode] * HOUR),
    payload: timer,
    key,
  })
}

/** Cancel every pending timer for a lesson (on cancellation or reschedule). */
export function cancelLessonTimers(jobs: Jobs, lessonId: string): Promise<number> {
  return jobs.cancelByKey(lessonKey(lessonId))
}
