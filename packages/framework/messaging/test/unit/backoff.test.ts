import { describe, expect, test } from "vitest"

import { backoffMs } from "../../src/backoff.ts"

describe("backoffMs", () => {
  test("stays within [0, min(cap, base * 2^(attempt-1)))", () => {
    const baseMs = 10
    const capMs = 1_000
    for (let attempt = 1; attempt <= 10; attempt++) {
      const bound = Math.min(capMs, baseMs * 2 ** (attempt - 1))
      for (let i = 0; i < 200; i++) {
        const d = backoffMs(attempt, { baseMs, capMs })
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThan(bound)
      }
    }
  })

  test("grows with the attempt (higher attempts allow larger max)", () => {
    // Sample the max observed delay; later attempts should reach higher.
    const opts = { baseMs: 10, capMs: 1_000_000 }
    const maxAt = (attempt: number) =>
      Math.max(...Array.from({ length: 500 }, () => backoffMs(attempt, opts)))
    expect(maxAt(5)).toBeGreaterThan(maxAt(1))
  })

  test("is clamped by capMs", () => {
    for (let i = 0; i < 200; i++) {
      expect(backoffMs(30, { baseMs: 1_000, capMs: 5_000 })).toBeLessThan(5_000)
    }
  })
})
