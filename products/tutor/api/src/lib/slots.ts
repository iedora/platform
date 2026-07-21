import { DateTime } from "luxon"

// Pure slot generation, service-side. Mirrors the web's booking.slots generators
// (the ones with no view concern) so the service can materialize a recurring
// series and offer reschedule slots. Times are wall-clock in the TUTOR's zone,
// resolved per-date so they stay correct across DST transitions.

export type AvailabilityRule = {
  weekday: number // 0 = Sunday .. 6 = Saturday (matches the DB)
  startTime: string // "HH:mm" or "HH:mm:ss", local wall-clock
  endTime: string
}

/** A bookable instant, and nothing else — labels are a viewer-zone concern. */
export type Slot = {
  startUtc: string
}

function hm(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number)
  return { hour: h ?? 0, minute: m ?? 0 }
}

/**
 * Expands weekly availability into concrete bookable slots. Times are treated as
 * wall-clock in `tz`, so "Tuesday 17:00 Europe/London" resolves to the correct
 * UTC instant on each date — including across BST/GMT transitions.
 */
export function generateSlots(opts: {
  rules: AvailabilityRule[]
  tz: string
  durationMinutes: number
  strideMinutes: number
  days: number
  nowUtc?: Date
}): Slot[] {
  const { rules, tz, durationMinutes, strideMinutes, days } = opts
  const now = opts.nowUtc ? DateTime.fromJSDate(opts.nowUtc).setZone(tz) : DateTime.now().setZone(tz)

  const slots: Slot[] = []
  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const day = now.startOf("day").plus({ days: dayOffset })
    const ourWeekday = day.weekday % 7 // luxon 1=Mon..7=Sun -> 0=Sun..6=Sat

    for (const rule of rules) {
      if (rule.weekday !== ourWeekday) continue
      const start = day.set({ ...hm(rule.startTime), second: 0, millisecond: 0 })
      const end = day.set({ ...hm(rule.endTime), second: 0, millisecond: 0 })

      for (
        let cursor = start;
        cursor.plus({ minutes: durationMinutes }) <= end;
        cursor = cursor.plus({ minutes: strideMinutes })
      ) {
        if (cursor <= now) continue // no past slots
        slots.push({ startUtc: cursor.toUTC().toISO()! })
      }
    }
  }

  return slots.sort((a, b) => a.startUtc.localeCompare(b.startUtc))
}

/**
 * The next `count` concrete UTC instants for a weekly recurrence — resolved
 * per-date in `tz`, so each occurrence is correct across DST transitions.
 */
export function nextOccurrences(opts: {
  weekday: number
  localTime: string
  tz: string
  count: number
  nowUtc?: Date
}): string[] {
  const now = opts.nowUtc ? DateTime.fromJSDate(opts.nowUtc).setZone(opts.tz) : DateTime.now().setZone(opts.tz)
  const { hour, minute } = hm(opts.localTime)
  const out: string[] = []
  let day = now.startOf("day")
  for (let i = 0; i < opts.count * 7 + 7 && out.length < opts.count; i++) {
    if (day.weekday % 7 === opts.weekday) {
      const dt = day.set({ hour, minute, second: 0, millisecond: 0 })
      if (dt > now) out.push(dt.toUTC().toISO()!)
    }
    day = day.plus({ days: 1 })
  }
  return out
}
