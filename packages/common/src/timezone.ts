/** True if `tz` is an IANA zone the runtime accepts — rejects junk before it
 *  reaches a database or a date library. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz })
    return true
  } catch {
    return false
  }
}
