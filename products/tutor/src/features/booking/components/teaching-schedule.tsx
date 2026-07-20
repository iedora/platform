import { describeZone, formatTime, weekdayIndex } from "@iedora/product-tutor/lib/time"
import { nextAvailabilityWindows, weekdayPlural, type AvailabilityRule } from "../booking.slots"

/** Monday-first (UK reading order). DB weekday is 0 = Sunday. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

/**
 * "When they teach", in the student's zone.
 *
 * The tutor writes availability as weekday + wall-clock in their own zone; a Dubai
 * student reading "Evenings" would assume theirs. So we resolve each rule to its
 * next real instant (slots.nextAvailabilityWindows, DST-correct) and format the
 * range in the student's zone (lib/time). When the two zones differ we show the
 * tutor's range too, so nobody guesses whose clock they're reading. Every bit of
 * time reasoning lives in slots.ts / lib/time — this component just lays it out.
 */
export function TeachingSchedule({
  rules,
  tutorTz,
  studentTz,
}: {
  rules: AvailabilityRule[]
  tutorTz: string
  studentTz: string
}) {
  if (rules.length === 0) return null

  const windows = nextAvailabilityWindows({ rules, tz: tutorTz })
  if (windows.length === 0) return null

  const crossZone = studentTz !== tutorTz

  // Bucket by the weekday the *student* experiences the window on: a late London
  // slot can land on the next day in Dubai, so the tutor's weekday would mislabel it.
  const byDay = new Map<number, { start: string; end: string }[]>()
  for (const w of windows) {
    const wd = weekdayIndex(w.startUtc, studentTz)
    const list = byDay.get(wd) ?? []
    list.push({ start: w.startUtc, end: w.endUtc })
    byDay.set(wd, list)
  }
  const days = WEEK_ORDER.filter((wd) => byDay.has(wd))

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-sm font-semibold">When they teach</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {crossZone ? (
          <>
            Your time in {describeZone(studentTz)}. The tutor teaches from{" "}
            {describeZone(tutorTz)}.
          </>
        ) : (
          <>All times in {describeZone(studentTz)}.</>
        )}
      </p>

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {days.map((wd) => {
          // Sort by time of day *in the student's zone*, not by absolute instant:
          // a morning window that already passed today resolves to next week and
          // would otherwise sort after this afternoon's still-upcoming window.
          const ranges = byDay
            .get(wd)!
            .slice()
            .sort((a, b) =>
              formatTime(a.start, studentTz).localeCompare(formatTime(b.start, studentTz)),
            )
          return (
            <li key={wd} className="flex items-start justify-between gap-4 p-3.5">
              <span className="pt-0.5 text-sm font-medium">{weekdayPlural(wd)}</span>
              <span className="flex flex-col items-end gap-2.5 text-right">
                {ranges.map((r, i) => (
                  <span key={i} className="leading-tight">
                    <span className="flex items-baseline justify-end gap-2">
                      {crossZone && (
                        <span className="text-[0.6rem] font-semibold tracking-wide text-muted-foreground uppercase">
                          You
                        </span>
                      )}
                      <span className="text-sm font-medium tabular-nums">
                        {formatTime(r.start, studentTz)} – {formatTime(r.end, studentTz)}
                      </span>
                    </span>
                    {crossZone && (
                      <span className="mt-0.5 flex items-baseline justify-end gap-2 text-muted-foreground">
                        <span className="text-[0.6rem] font-semibold tracking-wide uppercase">
                          Tutor
                        </span>
                        <span className="text-xs tabular-nums">
                          {formatTime(r.start, tutorTz)} – {formatTime(r.end, tutorTz)}
                        </span>
                      </span>
                    )}
                  </span>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
