import { DateTime } from "luxon"

import { dayKey } from "@iedora/product-tutor/lib/time"

export type AvailabilityRule = {
  weekday: number // 0 = Sunday .. 6 = Saturday (matches the DB)
  startTime: string // "HH:mm" or "HH:mm:ss", local wall-clock
  endTime: string
}

/**
 * A bookable instant, and nothing else. It deliberately carries no label: a slot
 * generated from a London tutor's "Tuesday 17:00" is 20:00 to a Dubai student,
 * so the only honest thing to pass around is the UTC instant. Labels are a view
 * concern and get formatted in the *viewer's* zone (see lib/time.ts).
 */
export type Slot = {
  startUtc: string
}

/** A day of slots, bucketed in the viewer's zone — not the tutor's. */
export type SlotDay = {
  key: string
  slots: Slot[]
}

function hm(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number)
  return { hour: h ?? 0, minute: m ?? 0 }
}

/**
 * Expands weekly availability into concrete bookable slots. Times are treated
 * as wall-clock in `tz`, so "Tuesday 17:00 Europe/London" resolves to the
 * correct UTC instant on each date — including across BST/GMT transitions.
 * `nowUtc` is injectable for deterministic tests.
 */
export function generateSlots(opts: {
  rules: AvailabilityRule[]
  tz: string // the TUTOR's zone: the one their wall-clock rules are written in
  durationMinutes: number // slot must fit before the window closes
  strideMinutes: number // spacing between slot starts
  days: number
  nowUtc?: Date
}): Slot[] {
  const { rules, tz, durationMinutes, strideMinutes, days } = opts
  const now = opts.nowUtc
    ? DateTime.fromJSDate(opts.nowUtc).setZone(tz)
    : DateTime.now().setZone(tz)

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
 * Buckets slots into days *as the viewer experiences them*. This has to happen in
 * the viewer's zone, not the tutor's: a London 23:00 slot is 03:00 the next day
 * in Dubai, so grouping by the tutor's calendar would file it under the wrong day
 * and the picker would lie about which date you're booking.
 */
export function groupSlotsByDay(slots: Slot[], viewerTz: string): SlotDay[] {
  const days = new Map<string, SlotDay>()
  for (const slot of slots) {
    const key = dayKey(slot.startUtc, viewerTz)
    const day = days.get(key) ?? { key, slots: [] }
    day.slots.push(slot)
    days.set(key, day)
  }
  return [...days.values()]
}

const WEEKDAY_PLURAL = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
]

function toMinutes(t: string): number {
  const { hour, minute } = hm(t)
  return hour * 60 + minute
}

function toHHmm(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** "Tuesdays" — for a weekday already resolved in the viewer's zone. */
export function weekdayPlural(weekday: number): string {
  return WEEKDAY_PLURAL[weekday] ?? "Weekly"
}

export type WeeklyOption = {
  /** The recurrence, in the TUTOR's zone. This is what we persist. */
  weekday: number
  localTime: string
  /** The next concrete instant it resolves to, for rendering in the viewer's zone. */
  nextUtc: string
}

/**
 * Distinct recurring weekly slots (weekday + wall-clock start) that fit a lesson.
 * These define the *recurrence* in the tutor's zone, which is the only zone it's
 * stable in — a series pinned to "Tuesday 17:00 London" stays there when the
 * clocks change, whereas the student's local time for it shifts by an hour.
 *
 * Each option also carries its next real instant, because "Tuesdays 17:00" is not
 * what a Dubai student experiences: for them it's 20:00, and a late-evening London
 * slot can even land on the following weekday. The UI labels from `nextUtc`.
 */
export function generateWeeklyOptions(opts: {
  rules: AvailabilityRule[]
  tz: string // the tutor's zone
  durationMinutes: number
  strideMinutes: number
  nowUtc?: Date
}): WeeklyOption[] {
  const seen = new Set<string>()
  const out: WeeklyOption[] = []
  for (const rule of opts.rules) {
    const start = toMinutes(rule.startTime)
    const end = toMinutes(rule.endTime)
    for (let m = start; m + opts.durationMinutes <= end; m += opts.strideMinutes) {
      const localTime = toHHmm(m)
      const key = `${rule.weekday}:${localTime}`
      if (seen.has(key)) continue
      seen.add(key)

      const [nextUtc] = nextOccurrences({
        weekday: rule.weekday,
        localTime,
        tz: opts.tz,
        count: 1,
        nowUtc: opts.nowUtc,
      })
      if (!nextUtc) continue
      out.push({ weekday: rule.weekday, localTime, nextUtc })
    }
  }
  return out.sort((a, b) => a.nextUtc.localeCompare(b.nextUtc))
}

export type AvailabilityWindow = {
  /** Next concrete occurrence of the window, UTC. Format in any viewer zone. */
  startUtc: string
  endUtc: string
}

/**
 * Each weekly availability rule resolved to its next concrete [start, end) instant.
 * Resolved on a real upcoming date in the tutor's zone, so it's DST-correct, and it
 * carries only UTC instants — the single source of "when the tutor teaches" that the
 * view formats in whatever zone it wants. No wall-clock math belongs in the UI.
 */
export function nextAvailabilityWindows(opts: {
  rules: AvailabilityRule[]
  tz: string // the tutor's zone: the one the wall-clock rules are written in
  nowUtc?: Date
}): AvailabilityWindow[] {
  const now = opts.nowUtc
    ? DateTime.fromJSDate(opts.nowUtc).setZone(opts.tz)
    : DateTime.now().setZone(opts.tz)

  const out: AvailabilityWindow[] = []
  for (const rule of opts.rules) {
    // Walk forward at most a week and a day to land on the next matching weekday
    // whose window hasn't already finished.
    let day = now.startOf("day")
    for (let i = 0; i < 8; i++, day = day.plus({ days: 1 })) {
      if (day.weekday % 7 !== rule.weekday) continue
      const start = day.set({ ...hm(rule.startTime), second: 0, millisecond: 0 })
      const end = day.set({ ...hm(rule.endTime), second: 0, millisecond: 0 })
      if (end <= now) continue // finished today; the match next week is the one to show
      out.push({ startUtc: start.toUTC().toISO()!, endUtc: end.toUTC().toISO()! })
      break
    }
  }
  return out.sort((a, b) => a.startUtc.localeCompare(b.startUtc))
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
  const now = opts.nowUtc
    ? DateTime.fromJSDate(opts.nowUtc).setZone(opts.tz)
    : DateTime.now().setZone(opts.tz)
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
