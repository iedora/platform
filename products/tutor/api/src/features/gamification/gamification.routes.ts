import { tutorBadgesInput } from "@iedora/tutor-contracts/gamification"
import { validate } from "@iedora/service-kit"
import { Hono } from "hono"

import { getStreak, listQuests, tutorBadges } from "../../data/gamification"
import { studentByUserId } from "../../data/students"
import type { TutorDeps } from "../../deps"
import type { TutorEnv } from "../../middleware"

// Gamification reads. Streak + quests are scoped to the authenticated student
// (resolved from the Bearer principal, never a client id); an absent student
// profile just reads empty. Tutor badges are a public display keyed by the tutor
// ids the caller passes (POST since it carries a list).
export function gamificationRoutes(deps: TutorDeps) {
  const db = () => deps.db.db
  return new Hono<TutorEnv>()
    .get("/gamification/streak", async (c) => {
      const student = await studentByUserId(db(), c.get("user").userId)
      const count = student ? await getStreak(db(), "student", student.id) : 0
      return c.json({ count })
    })
    .get("/gamification/quests", async (c) => {
      const student = await studentByUserId(db(), c.get("user").userId)
      const quests = student ? await listQuests(db(), "student", student.id) : []
      return c.json(quests)
    })
    .post("/gamification/tutor-badges", validate("json", tutorBadgesInput), async (c) => {
      const { tutorIds } = c.req.valid("json")
      return c.json({ badges: await tutorBadges(db(), tutorIds) })
    })
}
