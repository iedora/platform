"use client"

import { Button, buttonVariants } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import { ArrowLeft, CalendarClock, CreditCard, Send, Sparkles, Video } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { haptic } from "@iedora/product-tutor/lib/haptics"

import { openRescheduleAction } from "@iedora/product-tutor/features/reschedule/reschedule.open-reschedule"
import {
  confirmRescheduleAction,
  counterRescheduleAction,
} from "@iedora/product-tutor/features/reschedule/reschedule.respond-reschedule"
import { sendMessage } from "../chat.actions"
import type { ChatMessage, ChatThread, Party } from "../chat.types"

export function ChatWindow({ thread }: { thread: ChatThread }) {
  const router = useRouter()
  const [perspective, setPerspective] = useState<Party>("student")
  const [messages, setMessages] = useState<ChatMessage[]>(thread.messages)
  const [value, setValue] = useState("")
  const { executeAsync, isPending } = useAction(sendMessage)
  const openAction = useAction(openRescheduleAction)

  // Re-sync when the server sends new messages (after a router.refresh()).
  const signature = thread.messages.map((m) => m.id).join(",")
  useEffect(() => setMessages(thread.messages), [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the newest message in view, like a native chat.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const body = value.trim()
    if (!body) return
    haptic()
    setValue("")
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, kind: "text", party: perspective, body },
    ])
    await executeAsync({ conversationId: thread.id, body })
  }

  async function openReschedule() {
    await openAction.executeAsync({ conversationId: thread.id, as: perspective })
    router.refresh()
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <Link
          href="/chat"
          className="-ml-1 shrink-0 p-1 text-muted-foreground md:hidden"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-medium text-primary-foreground">
          {thread.initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium sm:text-base">
            {thread.name} · {thread.subject}
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {thread.rank} tutor · {thread.repliesIn}
          </div>
        </div>

        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={openReschedule}
          disabled={openAction.isPending}
          aria-label="Reschedule next lesson"
        >
          <CalendarClock />
          <span className="hidden sm:inline">Reschedule</span>
        </Button>

        {/* Dev affordance: view the two-sided conversation as either party. */}
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-border text-[0.7rem]">
          {(["student", "tutor"] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setPerspective(role)}
              className={cn(
                "px-1.5 py-1 capitalize transition-colors sm:px-2.5",
                perspective === role
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {role.slice(0, 1)}
              <span className="hidden sm:inline">{role.slice(1)}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
        {messages.map((m) => (
          <MessageView
            key={m.id}
            message={m}
            perspective={perspective}
            onChanged={() => router.refresh()}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* The tab bar is hidden in a conversation, so the composer owns the safe area. */}
      <form
        onSubmit={submit}
        className="flex items-end gap-2 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void submit(e)
            }
          }}
          rows={1}
          placeholder={`Message as ${perspective}…`}
          className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="icon" disabled={isPending || !value.trim()} aria-label="Send">
          <Send />
        </Button>
      </form>
    </div>
  )
}

function MessageView({
  message,
  perspective,
  onChanged,
}: {
  message: ChatMessage
  perspective: Party
  onChanged: () => void
}) {
  switch (message.kind) {
    case "system":
      return (
        <p className="max-w-[92%] self-center py-1 text-center font-mono text-[0.7rem] tracking-wide text-balance text-muted-foreground uppercase">
          {message.text}
        </p>
      )
    case "xp":
      return (
        <p className="flex max-w-[92%] items-center justify-center gap-1.5 self-center rounded-2xl border border-chart-1/40 bg-rating/10 px-3 py-1 text-center font-mono text-xs font-semibold text-balance text-chart-2">
          <Sparkles className="size-3.5 shrink-0" />
          {message.text}
        </p>
      )
    case "payment":
      return (
        <div className="flex max-w-[92%] flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 self-center rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-center text-xs text-muted-foreground">
          <CreditCard className="size-3.5 shrink-0" />
          <span className="font-medium text-foreground">{message.title}</span>
          <span>· {message.sub}</span>
        </div>
      )
    case "room":
      return (
        <div className="flex w-full max-w-[92%] flex-col items-center gap-2 self-center rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-center">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Video className="size-4 text-primary" />
            {message.title}
          </span>
          {message.sub && <span className="text-xs text-muted-foreground">{message.sub}</span>}
          {/* Full navigation to the /room redirect endpoint, not client routing, so
              it's a plain anchor (also keeps it out of typedRoutes). */}
          <a
            href={`/room/${message.lessonId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "sm" }), "mt-0.5")}
          >
            <Video className="size-3.5" />
            Join classroom
          </a>
        </div>
      )
    case "proposal":
      return <ProposalCard message={message} perspective={perspective} onChanged={onChanged} />
    case "text": {
      const mine = message.party === perspective
      return (
        <div
          className={cn(
            "max-w-[82%] rounded-2xl px-3.5 py-2 text-sm",
            mine
              ? "self-end rounded-br-sm bg-primary text-primary-foreground"
              : "self-start rounded-bl-sm border border-border bg-card",
          )}
        >
          {message.body}
        </div>
      )
    }
  }
}

function ProposalCard({
  message,
  perspective,
  onChanged,
}: {
  message: Extract<ChatMessage, { kind: "proposal" }>
  perspective: Party
  onChanged: () => void
}) {
  const confirm = useAction(confirmRescheduleAction)
  const counter = useAction(counterRescheduleAction)

  const mine = message.party === perspective
  // Only the awaited party (the recipient) can act, and only on a real thread.
  const actionable = Boolean(message.threadId) && !mine

  async function onConfirm(slot: { startUtc?: string; label: string }) {
    if (!message.threadId || !slot.startUtc) return
    await confirm.executeAsync({
      threadId: message.threadId,
      startUtc: slot.startUtc,
      label: slot.label,
      as: perspective,
    })
    onChanged()
  }

  async function onCounter() {
    if (!message.threadId) return
    await counter.executeAsync({ threadId: message.threadId, as: perspective })
    onChanged()
  }

  const busy = confirm.isPending || counter.isPending

  return (
    <div className="max-w-[90%] self-start rounded-2xl border border-border bg-card p-3.5">
      <div className="text-sm font-semibold">{message.title}</div>
      <div className="mb-2.5 text-xs text-muted-foreground">{message.sub}</div>
      <div className="flex flex-wrap gap-1.5">
        {message.slots.map((slot) => (
          <button
            key={slot.label}
            type="button"
            disabled={!actionable || busy || !slot.startUtc}
            onClick={() => onConfirm(slot)}
            className={cn(
              "rounded-lg border px-2.5 py-1 font-mono text-xs transition-colors",
              actionable && slot.startUtc
                ? "border-primary/40 bg-accent text-foreground hover:bg-primary hover:text-primary-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            {slot.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {actionable ? (
          <Button size="sm" variant="secondary" onClick={onCounter} disabled={busy}>
            Suggest other times
          </Button>
        ) : mine && message.threadId ? (
          <span className="text-xs text-muted-foreground">Waiting for a reply…</span>
        ) : null}
      </div>
    </div>
  )
}
