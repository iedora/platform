import { eventType, Inngest } from "inngest"
import { z } from "zod"

// The tutor service owns the durable timers (payment settlement + lesson-room
// opening). Same app id as the old Next host so in-flight events keep routing.
export const inngest = new Inngest({ id: "tutor-marketplace" })

/** Events that drive the payment lifecycle (Inngest v4 typed event definitions). */
export const lessonScheduled = eventType("lesson/scheduled", {
  schema: z.object({
    lessonId: z.string(),
    /** ISO instant the lesson starts — the timer counts back from this. */
    startsAtUtc: z.string(),
    mode: z.enum(["recurring", "one_off"]),
  }),
})

export const lessonCancelled = eventType("lesson/cancelled", {
  schema: z.object({ lessonId: z.string() }),
})
