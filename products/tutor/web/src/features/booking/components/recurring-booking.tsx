"use client"

import { Button } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { formatTime } from "@iedora/product-tutor/lib/time"
import { bookRecurring } from "../booking.actions"
import type { BookableSubject } from "../booking.queries"
import { weekdayPlural, type WeeklyOption } from "../booking.slots"

/**
 * The recurrence is stored in the tutor's zone ("Tuesdays 17:00"), which is the
 * only zone it's stable in across a DST change. But it's shown from its next real
 * instant in the viewer's — for a Dubai student that same series reads "Tuesdays
 * 20:00", and a late London slot can even land on the next weekday.
 */
function optionLabel(option: WeeklyOption, viewerTz: string): string {
  const weekday = viewerWeekday(option.nextUtc, viewerTz)
  return `${weekdayPlural(weekday)} ${formatTime(option.nextUtc, viewerTz)}`
}

/** 0 = Sunday .. 6 = Saturday, as the weekday falls in the viewer's zone. */
function viewerWeekday(instant: string, tz: string): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(
    new Date(instant),
  )
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short)
}

export function RecurringBooking({
  tutorId,
  subjects,
  weeklyOptions,
  viewerTz,
}: {
  tutorId: string
  subjects: BookableSubject[]
  weeklyOptions: WeeklyOption[]
  viewerTz: string
  tutorTz: string
}) {
  const router = useRouter()
  const [qualificationId, setQualificationId] = useState(subjects[0]?.qualificationId ?? "")
  const [option, setOption] = useState<WeeklyOption | null>(null)
  const { executeAsync, isPending } = useAction(bookRecurring)

  const subject = subjects.find((s) => s.qualificationId === qualificationId)

  async function confirm() {
    if (!option || !qualificationId) return
    const res = await executeAsync({
      tutorId,
      qualificationId,
      weekday: option.weekday,
      localTime: option.localTime,
    })
    if (res?.data?.conversationId) router.push(`/chat/${res.data.conversationId}`)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Only a choice when there IS one — otherwise "Teaches" already said it. */}
      <section className={subjects.length > 1 ? "" : "hidden"}>
        <h2 className="mb-2 text-sm font-semibold">Subject</h2>
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <button
              key={s.qualificationId}
              type="button"
              onClick={() => setQualificationId(s.qualificationId)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                qualificationId === s.qualificationId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              {s.subject}
              <span className="ml-1.5 font-mono text-xs opacity-70">
                {s.price}/lesson
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold">Weekly lessons</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          55 minutes, same time each week. Charged {subject?.price ?? ""} 24h before every
          lesson.
        </p>
        {weeklyOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recurring slots available.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {weeklyOptions.map((o) => (
              <button
                key={`${o.weekday}-${o.localTime}`}
                type="button"
                onClick={() => setOption(o)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left font-mono text-sm transition-all active:scale-[0.97]",
                  option?.weekday === o.weekday && option?.localTime === o.localTime
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                {optionLabel(o, viewerTz)}
              </button>
            ))}
          </div>
        )}
      </section>

      <Button size="lg" disabled={!option || isPending} onClick={confirm} className="self-start">
        {isPending
          ? "Booking…"
          : option
            ? `Book ${optionLabel(option, viewerTz)} · ${subject?.price ?? ""}/lesson`
            : "Pick a weekly slot"}
      </Button>
    </div>
  )
}
