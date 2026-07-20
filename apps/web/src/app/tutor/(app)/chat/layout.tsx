import { ConversationList } from "@iedora/product-tutor/features/chat/components/conversation-list"

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full min-w-0 md:grid-cols-[320px_1fr]">
      <aside className="hidden min-h-0 overflow-y-auto border-r border-border md:block">
        <ConversationList />
      </aside>
      <section className="min-h-0 min-w-0">{children}</section>
    </div>
  )
}
