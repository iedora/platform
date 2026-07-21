"use client"

import { Button } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import { Globe } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { haptic } from "@iedora/product-tutor/lib/haptics"
import {
  describeZone,
  formatDay,
  formatDayChip,
  formatLessonTime,
  formatTime,
  referenceTime,
} from "@iedora/product-tutor/lib/time"
import { bookIntro } from "../booking.actions"
import type { BookableSubject } from "../booking.queries"
import type { SlotDay } from "../booking.slots"

export function IntroBooking({
  tutorId,
  subjects,
  days,
  viewerTz,
  tutorTz,
  tutorName,
}: {
  tutorId: string
  subjects: BookableSubject[]
  days: SlotDay[]
  viewerTz: string
  tutorTz: string
  tutorName: string
}) {
  const tutorFirstName = tutorName.split(" ")[0] ?? "them"
  const router = useRouter()
  const [subjectId, setSubjectId] = useState(subjects[0]?.subjectId ?? "")
  const [dayKey, setDayKey] = useState(days[0]?.key ?? "")
  const [selected, setSelected] = useState<string | null>(null)
  const { executeAsync, isPending } = useAction(bookIntro)

  const day = days.find((d) => d.key === dayKey) ?? days[0]

  async function confirm() {
    if (!selected || !subjectId) return
    // Only the instant goes to the server. The label it records is derived there,
    // so a client can't book 17:00 and have the chat claim it was 09:00.
    const res = await executeAsync({ tutorId, subjectId, startsAtUtc: selected })
    if (res?.data?.conversationId) router.push(`/chat/${res.data.conversationId}`)
  }

  if (days.length === 0 || !day) {
    return (
      <p className="text-sm text-muted-foreground">
        No free slots in the next two weeks. Message them to find a time.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Only a choice when there IS one — otherwise "Teaches" already said it. */}
      <section className={subjects.length > 1 ? "" : "hidden"}>
        <h2 className="mb-2 text-sm font-semibold">Subject</h2>
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <button
              key={s.subjectId}
              type="button"
              onClick={() => setSubjectId(s.subjectId)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                subjectId === s.subjectId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              {s.subject}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Free 15-minute intro</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a time. No card needed, and no obligation to book more.
        </p>

        {/* Whose clock are these times on? Never make anyone guess. */}
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <Globe className="size-3.5 shrink-0" aria-hidden />
          <span>Times in {describeZone(viewerTz)}</span>
          {viewerTz !== tutorTz && <span>· tutor is in {describeZone(tutorTz)}</span>}
        </p>

        {/* Day strip: only days the tutor actually works. A full 14-day calendar
            would be mostly empty days you can tap into and find nothing. */}
        <div
          className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6"
          role="tablist"
          aria-label="Day"
        >
          {days.map((d) => {
            const chip = formatDayChip(d.slots[0]!.startUtc, viewerTz)
            const on = d.key === day.key
            return (
              <button
                key={d.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  haptic()
                  setDayKey(d.key)
                  setSelected(null)
                }}
                className={cn(
                  "flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors active:scale-95",
                  on
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                <span className="text-xs font-medium">{chip.weekday}</span>
                <span className="text-lg leading-none font-semibold tabular-nums">{chip.day}</span>
                <span className="text-[0.6rem] tabular-nums opacity-70">{d.slots.length} free</span>
              </button>
            )
          })}
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            {formatDay(day.slots[0]!.startUtc, viewerTz)}
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {day.slots.map((slot) => (
              <button
                key={slot.startUtc}
                type="button"
                onClick={() => {
                  haptic()
                  setSelected(slot.startUtc)
                }}
                className={cn(
                  "flex flex-col items-center rounded-xl border py-2 leading-tight transition-all active:scale-95",
                  selected === slot.startUtc
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className="text-sm font-medium tabular-nums">
                  {formatTime(slot.startUtc, viewerTz)}
                </span>
                {/* The tutor's clock, for reference. You're asking for someone's
                    evening, and it's worth knowing that before you ask. */}
                {referenceTime(slot.startUtc, viewerTz, tutorTz) && (
                  <span className="text-[0.65rem] tabular-nums opacity-60">
                    {referenceTime(slot.startUtc, viewerTz, tutorTz)} {tutorFirstName}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div>
        <Button
          size="lg"
          disabled={!selected || isPending}
          onClick={confirm}
          className="w-full rounded-xl text-base font-semibold active:scale-[0.98]"
        >
          {isPending
            ? "Booking…"
            : selected
              ? `Book · ${formatLessonTime(selected, viewerTz)}`
              : "Pick a time"}
        </Button>
        {selected && referenceTime(selected, viewerTz, tutorTz) && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            That&apos;s {referenceTime(selected, viewerTz, tutorTz)} for {tutorFirstName}.
          </p>
        )}
      </div>
    </div>
  )
}
