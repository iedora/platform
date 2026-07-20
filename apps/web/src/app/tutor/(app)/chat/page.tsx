import { MessageSquare } from "lucide-react"

import { ConversationList } from "@iedora/product-tutor/features/chat/components/conversation-list"

export default function ChatIndexPage() {
  return (
    <>
      <ConversationList className="md:hidden" />
      <div className="hidden h-full place-items-center text-center text-muted-foreground md:grid">
        <div>
          <MessageSquare className="mx-auto mb-2 size-8" />
          <p>Select a conversation</p>
        </div>
      </div>
    </>
  )
}
