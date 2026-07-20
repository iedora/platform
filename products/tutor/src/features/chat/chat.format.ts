import type { RawMessageDTO } from "@iedora/product-tutor/contracts/chat"

import { formatLessonTime } from "@iedora/product-tutor/lib/time"

import type { ChatMessage } from "./chat.types"

// Map a raw wire message to the ChatMessage view model. Presentation, not data:
// system/room cards that refer to a moment carry the instant (payload.startsAtUtc)
// so the tutor and student read the same row in their own zones — formatted here
// with the viewer's tz. Kept db-free so the BFF wrapper can use it.
export function toChatMessage(m: RawMessageDTO, viewerTz: string): ChatMessage {
  const party = m.senderType === "tutor" ? "tutor" : "student"
  const p = (m.payload ?? {}) as {
    title?: string
    sub?: string
    threadId?: string
    startsAtUtc?: string
    lessonId?: string
    slots?: Array<string | { startUtc?: string; label: string }>
  }
  switch (m.type) {
    case "system": {
      const at = p.startsAtUtc ? ` · ${formatLessonTime(p.startsAtUtc, viewerTz)}` : ""
      return { id: m.id, kind: "system", text: `${m.body ?? ""}${at}` }
    }
    case "rank_up":
      return { id: m.id, kind: "xp", text: m.body ?? "" }
    case "proposal":
      return {
        id: m.id,
        kind: "proposal",
        party,
        title: p.title ?? "Reschedule",
        sub: p.sub ?? "",
        threadId: p.threadId,
        slots: (p.slots ?? []).map((s) => (typeof s === "string" ? { label: s } : s)),
      }
    case "payment_request":
      return { id: m.id, kind: "payment", title: p.title ?? "Payment", sub: p.sub ?? "" }
    case "lesson_room":
      return {
        id: m.id,
        kind: "room",
        lessonId: p.lessonId ?? "",
        title: m.body ?? "Your classroom is ready",
        sub: p.startsAtUtc ? formatLessonTime(p.startsAtUtc, viewerTz) : "",
      }
    default:
      return { id: m.id, kind: "text", party, body: m.body ?? "" }
  }
}
