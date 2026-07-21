import {
  cancelLessonInput,
  completeLessonInput,
  leaveReviewInput,
  markNoShowInput,
} from "@iedora/tutor-contracts/lessons"
import { REVIEW_TAGS, type ReviewTag } from "@iedora/tutor-db/enums"
import { validate } from "@iedora/service-kit"
import { Hono } from "hono"

import { getTutorProgress, listStudentLessons } from "../../data/lessons"
import { studentByUserId, tutorByUserId } from "../../data/students"
import type { TutorDeps } from "../../deps"
import { forbidden, notFound } from "../../errors"
import type { TutorEnv } from "../../middleware"
import { roomUrlFor } from "./lessons.room"
import { cancelLesson, completeLesson, leaveReview, markNoShow } from "./lessons.usecases"

// The authenticated student's lessons dashboard + the lesson mutations. Identity
// comes from the verified Bearer principal; the student is resolved server-side
// (never a client-supplied id). The review's tag vocabulary is enforced here.
export function lessonsRoutes(deps: TutorDeps) {
  const db = () => deps.db.db
  const validTags = new Set<string>(REVIEW_TAGS)

  return new Hono<TutorEnv>()
    .get("/lessons", async (c) => {
      const student = await studentByUserId(db(), c.get("user").userId)
      if (!student) throw notFound()
      const lessons = await listStudentLessons(db(), student.id)
      const qualIds = [
        ...new Set(lessons.map((l) => l.qualificationId).filter((id): id is string => Boolean(id))),
      ]
      const progress = await getTutorProgress(db(), qualIds)
      return c.json({ lessons, progress })
    })
    .post("/lessons/complete", validate("json", completeLessonInput), async (c) => {
      const { lessonId } = c.req.valid("json")
      return c.json(await completeLesson(deps, lessonId))
    })
    .post("/lessons/cancel", validate("json", cancelLessonInput), async (c) => {
      const { lessonId, as } = c.req.valid("json")
      return c.json(await cancelLesson(deps, { lessonId, by: as }))
    })
    .post("/lessons/no-show", validate("json", markNoShowInput), async (c) => {
      const { lessonId, who } = c.req.valid("json")
      await markNoShow(deps, { lessonId, who })
      return c.json({ ok: true })
    })
    .post("/lessons/review", validate("json", leaveReviewInput), async (c) => {
      const student = await studentByUserId(db(), c.get("user").userId)
      if (!student) throw notFound()
      const { lessonId, rating, comment, tags } = c.req.valid("json")
      const cleanTags = tags.filter((t): t is ReviewTag => validTags.has(t))
      const result = await leaveReview(deps, {
        lessonId,
        studentId: student.id,
        rating,
        comment,
        tags: cleanTags,
      })
      return c.json(result)
    })
    // The viewer's LessonSpace URL (opens the room on demand). Role-scoped: the
    // tutor's leader URL is never handed to the student. The web /room route
    // redirects the browser to whatever `url` this returns.
    .get("/lessons/:id/room", async (c) => {
      const userId = c.get("user").userId
      const [student, tutor] = await Promise.all([
        studentByUserId(db(), userId),
        tutorByUserId(db(), userId),
      ])
      const res = await roomUrlFor(deps, c.req.param("id"), {
        tutorId: tutor?.id,
        studentId: student?.id,
      })
      if (res.status === "not-found") throw notFound()
      if (res.status === "forbidden") throw forbidden()
      if (res.status === "not-ready") return c.json({ error: "Classroom not ready yet" }, 503)
      return c.json({ url: res.url })
    })
}
