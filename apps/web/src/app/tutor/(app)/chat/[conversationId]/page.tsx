import { notFound } from "next/navigation"

import { ChatWindow } from "@iedora/product-tutor/features/chat/components/chat-window"
import { getThread } from "@iedora/product-tutor/api/chat"
import { requireViewer } from "@iedora/product-tutor/auth/session"

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const viewer = await requireViewer()
  const thread = await getThread(conversationId, viewer.timezone)
  if (!thread) notFound()
  return <ChatWindow thread={thread} />
}
