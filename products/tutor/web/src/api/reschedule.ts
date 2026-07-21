import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type {
  ConfirmRescheduleInput,
  CounterRescheduleInput,
  OpenRescheduleInput,
  OpenRescheduleResult,
  RescheduleConversationResult,
} from "@iedora/product-tutor/contracts/reschedule"

// Reschedule negotiation, through the service. Slot generation, the turn-taking
// rule and the charge-timer reset all run server-side; these just forward the call.

const post = <T>(path: string, body: unknown) =>
  apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

export function openReschedule(input: OpenRescheduleInput): Promise<OpenRescheduleResult> {
  return post<OpenRescheduleResult>("/api/reschedule/open", input)
}

export function counterReschedule(input: CounterRescheduleInput): Promise<RescheduleConversationResult> {
  return post<RescheduleConversationResult>("/api/reschedule/counter", input)
}

export function confirmReschedule(input: ConfirmRescheduleInput): Promise<RescheduleConversationResult> {
  return post<RescheduleConversationResult>("/api/reschedule/confirm", input)
}
