// Milliseconds in each time unit — the canonical durations for scheduling,
// timeouts, TTLs, and "N ago" math. Compose them (`5 * MINUTE`, `Date.now() +
// DAY`) instead of re-deriving `60_000` / `24 * 60 * 60 * 1000` in every service.
export const SECOND = 1_000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
export const WEEK = 7 * DAY
