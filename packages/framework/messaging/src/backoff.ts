export type BackoffOptions = {
  /** First-retry delay (ms). */
  baseMs: number
  /** Maximum delay (ms) — the exponential is clamped here. */
  capMs: number
}

/**
 * Full-jitter exponential backoff: `random(0, min(cap, base * 2^attempt))`.
 * Jitter spreads retries so a fleet of workers doesn't stampede a recovering
 * dependency. `attempt` is 1-based (the delay before the Nth retry).
 */
export function backoffMs(attempt: number, opts: BackoffOptions): number {
  const exp = Math.min(opts.capMs, opts.baseMs * 2 ** Math.max(0, attempt - 1))
  return Math.floor(Math.random() * exp)
}
