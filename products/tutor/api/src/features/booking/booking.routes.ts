import { bookIntroInput, bookRecurringInput } from "#contracts/booking"
import { validate } from "@iedora/service-kit"
import { Hono } from "hono"

import { hasLessonWith } from "../../data/booking"
import { studentByUserId } from "../../data/students"
import type { TutorDeps } from "../../deps"
import { notFound } from "../../errors"
import type { TutorEnv } from "../../middleware"
import { bookIntroLesson, bookRecurringSeries } from "./booking.usecases"

// Booking gateway reads + the booking mutations. Student-scoped: the student is
// resolved from the verified Bearer principal (never a client-supplied id).
export function bookingRoutes(deps: TutorDeps) {
  const db = () => deps.db.db
  return new Hono<TutorEnv>()
    .get("/tutors/:id/has-lesson", async (c) => {
      const student = await studentByUserId(db(), c.get("user").userId)
      const hasLesson = student ? await hasLessonWith(db(), c.req.param("id"), student.id) : false
      return c.json({ hasLesson })
    })
    .post("/booking/intro", validate("json", bookIntroInput), async (c) => {
      const student = await studentByUserId(db(), c.get("user").userId)
      if (!student) throw notFound()
      const { tutorId, subjectId, startsAtUtc } = c.req.valid("json")
      return c.json(
        await bookIntroLesson(deps, { tutorId, studentId: student.id, subjectId, startsAtUtc }),
      )
    })
    .post("/booking/recurring", validate("json", bookRecurringInput), async (c) => {
      const student = await studentByUserId(db(), c.get("user").userId)
      if (!student) throw notFound()
      const { tutorId, qualificationId, weekday, localTime } = c.req.valid("json")
      return c.json(
        await bookRecurringSeries(deps, {
          tutorId,
          studentId: student.id,
          qualificationId,
          weekday,
          localTime,
        }),
      )
    })
}
