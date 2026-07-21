import { sendMessageInput } from "@iedora/tutor-contracts/chat"
import { validate } from "@iedora/service-kit"
import { Hono } from "hono"

import { getThread, getUnreadCount, insertMessage, listConversations, senderFor } from "../../data/chat"
import { studentByUserId, tutorByUserId } from "../../data/students"
import type { TutorDeps } from "../../deps"
import { forbidden, notFound } from "../../errors"
import type { TutorEnv } from "../../middleware"

// Chat reads. Identity comes from the verified Bearer principal; the student/tutor
// is resolved server-side (never a client id). Conversations + threads are
// student-scoped; the unread badge scopes to whichever profile the caller has.
export function chatRoutes(deps: TutorDeps) {
  const db = () => deps.db.db
  return new Hono<TutorEnv>()
    .get("/conversations", async (c) => {
      const student = await studentByUserId(db(), c.get("user").userId)
      if (!student) return c.json({ conversations: [] })
      return c.json({ conversations: await listConversations(db(), student.id) })
    })
    .get("/conversations/:id", async (c) => {
      const student = await studentByUserId(db(), c.get("user").userId)
      if (!student) throw notFound()
      const thread = await getThread(db(), c.req.param("id"), student.id)
      if (!thread) throw notFound()
      return c.json(thread)
    })
    .post("/conversations/:id/messages", validate("json", sendMessageInput), async (c) => {
      const conversationId = c.req.param("id")
      const sender = await senderFor(db(), conversationId, c.get("user").userId)
      if (!sender) throw forbidden()
      const { body } = c.req.valid("json")
      return c.json(await insertMessage(db(), { conversationId, senderType: sender, body }))
    })
    .get("/unread", async (c) => {
      const userId = c.get("user").userId
      const student = await studentByUserId(db(), userId)
      if (student) {
        const count = await getUnreadCount(db(), {
          col: "studentId",
          id: student.id,
          role: "student",
        })
        return c.json({ count })
      }
      const tutor = await tutorByUserId(db(), userId)
      if (tutor) {
        const count = await getUnreadCount(db(), { col: "tutorId", id: tutor.id, role: "tutor" })
        return c.json({ count })
      }
      return c.json({ count: 0 })
    })
}
