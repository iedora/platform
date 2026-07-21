export type Party = "tutor" | "student"

export type ProposalSlot = { startUtc?: string; label: string }

/**
 * View models the chat components render. `party` is the sender's side; the
 * client computes "me/them" from the active perspective, so the same thread
 * renders correctly for either the student or the tutor.
 */
export type ChatMessage =
  | { id: string; kind: "text"; party: Party; body: string }
  | { id: string; kind: "system"; text: string }
  | { id: string; kind: "xp"; text: string }
  | {
      id: string
      kind: "proposal"
      party: Party
      title: string
      sub: string
      threadId?: string // present on real (actionable) reschedule proposals
      slots: ProposalSlot[]
    }
  | { id: string; kind: "payment"; title: string; sub: string }
  | { id: string; kind: "room"; lessonId: string; title: string; sub: string }

export type ChatSummary = {
  id: string
  name: string
  initial: string
  subject: string
  rank: string
  preview: string
  unread: number
}

export type ChatThread = ChatSummary & {
  repliesIn: string
  messages: ChatMessage[]
}
