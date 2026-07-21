import {
  confirmRescheduleInput,
  counterRescheduleInput,
  openRescheduleInput,
} from "#contracts/reschedule"
import { validate } from "@iedora/service-kit"
import { Hono } from "hono"

import type { TutorDeps } from "../../deps"
import type { TutorEnv } from "../../middleware"
import { confirmReschedule, counterReschedule, openReschedule } from "./reschedule.usecases"

// Reschedule negotiation. The service resolves the lesson, generates the offered
// slots, enforces the turn-taking rule, and resets the charge timer. Identity is
// carried in the `as` field (both parties share the conversation), matching the
// existing UI — the closed vocabulary is enforced by the zValidator.
export function rescheduleRoutes(deps: TutorDeps) {
  return new Hono<TutorEnv>()
    .post("/reschedule/open", validate("json", openRescheduleInput), async (c) => {
      const { conversationId, as } = c.req.valid("json")
      return c.json(await openReschedule(deps, { conversationId, by: as }))
    })
    .post("/reschedule/counter", validate("json", counterRescheduleInput), async (c) => {
      const { threadId, as } = c.req.valid("json")
      return c.json(await counterReschedule(deps, { threadId, by: as }))
    })
    .post("/reschedule/confirm", validate("json", confirmRescheduleInput), async (c) => {
      const { threadId, startUtc, label, as } = c.req.valid("json")
      return c.json(await confirmReschedule(deps, { threadId, by: as, startUtc, label }))
    })
}
