import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type { ChatSummaryDTO, ThreadDTO, UnreadCountDTO } from "@iedora/product-tutor/contracts/chat"

import { toChatMessage } from "@iedora/product-tutor/features/chat/chat.format"
import type { ChatSummary, ChatThread } from "@iedora/product-tutor/features/chat/chat.types"

// Chat BFF wrappers. The student/tutor is resolved server-side from the Bearer;
// here we only reconstruct the view models (mapping raw messages → ChatMessage
// with the viewer's timezone).

export async function listConversations(): Promise<ChatSummary[]> {
  const { conversations } = await apiJson<{ conversations: ChatSummaryDTO[] }>("/api/conversations")
  return conversations
}

export async function getThread(
  conversationId: string,
  viewerTz: string,
): Promise<ChatThread | undefined> {
  try {
    const dto = await apiJson<ThreadDTO>(`/api/conversations/${encodeURIComponent(conversationId)}`)
    return {
      id: dto.id,
      name: dto.name,
      initial: dto.initial,
      subject: dto.subject,
      rank: dto.rank,
      preview: "",
      unread: 0,
      repliesIn: dto.repliesIn,
      messages: dto.messages.map((m) => toChatMessage(m, viewerTz)),
    }
  } catch {
    return undefined
  }
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<{ id: string; body: string }> {
  return apiJson(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  })
}

export async function getUnreadCount(): Promise<number> {
  try {
    const { count } = await apiJson<UnreadCountDTO>("/api/unread")
    return count
  } catch {
    return 0 // anonymous / no profile → nothing to badge
  }
}
