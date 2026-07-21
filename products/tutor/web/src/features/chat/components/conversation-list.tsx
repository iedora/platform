import { cn } from "@iedora/ui/lib/utils"
import Link from "next/link"

import { listConversations } from "@iedora/product-tutor/api/chat"

export async function ConversationList({
  className,
  activeId,
}: {
  className?: string
  activeId?: string
}) {
  const conversations = await listConversations()

  return (
    <nav className={cn("flex flex-col gap-0.5 p-2", className)}>
      <p className="px-2.5 pt-2 pb-3 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        Messages
      </p>

      {conversations.length === 0 && (
        <p className="px-2.5 text-sm text-muted-foreground">No conversations yet.</p>
      )}

      {conversations.map((c) => (
        <Link
          key={c.id}
          href={`/chat/${c.id}`}
          className={cn(
            "flex items-center gap-3 rounded-lg p-2.5 transition-all hover:bg-muted active:scale-[0.99] active:bg-muted",
            activeId === c.id && "bg-muted",
          )}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-medium text-primary-foreground">
            {c.initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{c.name}</span>
              {c.unread > 0 && (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {c.unread}
                </span>
              )}
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              {c.preview}
            </span>
            <span className="mt-0.5 block font-mono text-[0.7rem] text-muted-foreground">
              {c.subject} · {c.rank}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  )
}
