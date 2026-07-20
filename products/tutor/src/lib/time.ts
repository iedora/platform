// Subpath, not the barrel: this module is imported by client components, and the
// barrel re-exports the pg client, which drags pg + node:dns into the browser.
import { DEFAULT_TIMEZONE } from "@iedora/product-tutor/domain/time"
import { DateTime } from "luxon"

/**
 * Every user-facing time in the app is formatted here, and every one of these
 * takes an explicit `tz`. That's the point: a `toFormat()` call anywhere else
 * silently renders in the server's zone or a hardcoded "Europe/London", which is
 * correct for a London student and wrong for a Dubai one.
 */

function at(instant: string | Date, tz: string): DateTime {
  const dt = typeof instant === "string" ? DateTime.fromISO(instant) : DateTime.fromJSDate(instant)
  return dt.setZone(tz)
}

/** "Thu 17 Jul, 17:00" — the standard one-line stamp for a lesson. */
export function formatLessonTime(instant: string | Date, tz: string): string {
  return at(instant, tz).toFormat("EEE d LLL, HH:mm")
}

/** "17:00" — for a time chosen under a day heading that already says the date. */
export function formatTime(instant: string | Date, tz: string): string {
  return at(instant, tz).toFormat("HH:mm")
}

/** "Today" / "Tomorrow" / "Thu 17 Jul" — the day-strip heading. */
export function formatDay(instant: string | Date, tz: string): string {
  const dt = at(instant, tz)
  const today = DateTime.now().setZone(tz).startOf("day")
  const days = dt.startOf("day").diff(today, "days").days
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  return dt.toFormat("EEE d LLL")
}

/** "Sat 19" — the compact two-line day chip. */
export function formatDayChip(instant: string | Date, tz: string): { weekday: string; day: string } {
  const dt = at(instant, tz)
  return { weekday: dt.toFormat("EEE"), day: dt.toFormat("d") }
}

/** Stable per-day bucket key *in the viewer's zone* — the grouping must shift with it. */
export function dayKey(instant: string | Date, tz: string): string {
  return at(instant, tz).toFormat("yyyy-LL-dd")
}

/** 0 = Sunday .. 6 = Saturday, *in the viewer's zone*. For grouping instants by weekday. */
export function weekdayIndex(instant: string | Date, tz: string): number {
  return at(instant, tz).weekday % 7
}

/**
 * "Dubai (GMT+4)" — names the zone the times above are in. Shown whenever the
 * viewer's zone differs from the tutor's, so nobody has to guess whose clock
 * they're reading.
 */
export function describeZone(tz: string): string {
  const dt = DateTime.now().setZone(tz)
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz
  return `${city} (${dt.toFormat("ZZZZ")})`
}

/** The viewer's zone as the browser sees it, for defaulting a new account. */
export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE
}

/**
 * The other party's clock for the same instant, or null when both are in the same
 * zone (in which case a reference line is just noise). Storage and reasoning are
 * always UTC; this exists purely so a Dubai student booking 21:00 can see they're
 * asking for someone's 18:00, and knows they aren't dragging them out of bed.
 */
export function referenceTime(
  instant: string | Date,
  viewerTz: string,
  otherTz: string,
): string | null {
  if (viewerTz === otherTz) return null
  return formatTime(instant, otherTz)
}
