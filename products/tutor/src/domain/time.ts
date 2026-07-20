/**
 * The scheduling contract, in one place.
 *
 * 1. Instants are stored in UTC (`lesson.startsAtUtc`). Always.
 * 2. A wall-clock ("Tuesday 17:00") is only meaningful next to the zone it was
 *    written in — that's `tutor.timezone` for availability and lesson series.
 * 3. Times are *displayed* in the viewer's zone (`student.timezone`), which is
 *    not necessarily the tutor's. A Dubai student sees 20:00 for a London 17:00.
 *
 * Break rule 2 or 3 and you get times that are silently wrong for exactly the
 * users who aren't in the tutor's country, which is the hardest kind to notice.
 */

/** Fallback when we don't know someone's zone yet. Not an assumption to build on. */
export const DEFAULT_TIMEZONE = "Europe/London"

/** How far ahead the intro picker offers slots. */
export const INTRO_BOOKING_DAYS = 14

/** Rejects a junk zone before it reaches the DB or Luxon. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz })
    return true
  } catch {
    return false
  }
}
