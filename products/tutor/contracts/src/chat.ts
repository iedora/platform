import { z } from "zod"

// Wire contracts for chat. Conversation summaries + thread headers are formatted
// server-side (no tz). Messages travel RAW (id/sender/type/body/payload) — the web
// maps them to the ChatMessage view model, formatting any embedded instants with
// the viewer's timezone.

export interface ChatSummaryDTO {
  id: string
  name: string
  initial: string
  subject: string
  rank: string
  preview: string
  unread: number
}

export interface RawMessageDTO {
  id: string
  senderType: "tutor" | "student" | "system"
  type: string
  body: string | null
  payload: Record<string, unknown> | null
}

export interface ThreadDTO {
  id: string
  name: string
  initial: string
  subject: string
  rank: string
  repliesIn: string
  messages: RawMessageDTO[]
}

export interface UnreadCountDTO {
  count: number
}

// Send a message to a conversation (the id is a path param). The sender side is
// derived server-side from the principal's membership, never trusted from input.
export const sendMessageInput = z.object({
  body: z.string().trim().min(1, "Type a message first").max(2000),
})
export type SendMessageInput = z.infer<typeof sendMessageInput>

export interface SentMessageDTO {
  id: string
  body: string
}
