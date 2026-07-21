import { z } from "zod"

// Reschedule negotiation inputs. The service owns slot generation, the turn-taking
// rules, and the charge-timer reset; the web sends only the conversation/thread id,
// the actor, and (on confirm) the chosen instant.

const party = z.enum(["tutor", "student"])

export const openRescheduleInput = z.object({
  conversationId: z.uuid(),
  as: party,
})
export type OpenRescheduleInput = z.infer<typeof openRescheduleInput>
export interface OpenRescheduleResult {
  threadId: string
}

export const counterRescheduleInput = z.object({
  threadId: z.uuid(),
  as: party,
})
export type CounterRescheduleInput = z.infer<typeof counterRescheduleInput>

export const confirmRescheduleInput = z.object({
  threadId: z.uuid(),
  startUtc: z.iso.datetime({ offset: true }),
  label: z.string().min(1),
  as: party,
})
export type ConfirmRescheduleInput = z.infer<typeof confirmRescheduleInput>

export interface RescheduleConversationResult {
  conversationId: string
}
