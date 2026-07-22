import { describe, expect, it } from "vitest"

import { DAY, HOUR, MINUTE, parseJson, SECOND, WEEK } from "./index.ts"

describe("duration", () => {
  it("composes from milliseconds", () => {
    expect(SECOND).toBe(1_000)
    expect(MINUTE).toBe(60_000)
    expect(HOUR).toBe(3_600_000)
    expect(DAY).toBe(86_400_000)
    expect(WEEK).toBe(7 * DAY)
  })
})

describe("parseJson", () => {
  it("parses a JSON string", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 })
  })
  it("passes through an already-parsed value", () => {
    const obj = { a: 1 }
    expect(parseJson(obj)).toBe(obj)
  })
})
