import { describe, expect, it } from "vitest"

import {
  BASE32_UNAMBIGUOUS,
  clamp,
  clampLimit,
  DAY,
  errorMessage,
  formatMoney,
  HOUR,
  isValidTimezone,
  MINUTE,
  parseJson,
  randomHex,
  randomString,
  SECOND,
  slugify,
  stripProtocol,
  WEEK,
} from "./index.ts"

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

describe("errorMessage", () => {
  it("returns an Error's message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
  })
  it("stringifies non-Errors", () => {
    expect(errorMessage("nope")).toBe("nope")
    expect(errorMessage(42)).toBe("42")
  })
})

describe("slugify", () => {
  it("deaccents, lowercases, and dashes", () => {
    expect(slugify("Café del Mar")).toBe("cafe-del-mar")
  })
  it("trims edge dashes and collapses runs", () => {
    expect(slugify("  --Hello,  World!--  ")).toBe("hello-world")
  })
  it("caps at maxLen without a trailing dash", () => {
    expect(slugify("a b c d", { maxLen: 3 })).toBe("a-b")
  })
  it("falls back when empty or under minLen", () => {
    expect(slugify("🎉", { fallback: "x" })).toBe("x")
    expect(slugify("a", { minLen: 2, fallback: "" })).toBe("")
  })
})

describe("clampLimit", () => {
  it("passes an in-range value through", () => {
    expect(clampLimit(25)).toBe(25)
  })
  it("defaults when missing or out of range", () => {
    expect(clampLimit(undefined)).toBe(50)
    expect(clampLimit(0)).toBe(50)
    expect(clampLimit(9999)).toBe(50)
  })
  it("honours custom bounds", () => {
    expect(clampLimit(500, { def: 10, max: 100 })).toBe(10)
  })
})

describe("random", () => {
  it("randomString has the right length and alphabet", () => {
    const s = randomString(16)
    expect(s).toHaveLength(16)
    expect([...s].every((c) => BASE32_UNAMBIGUOUS.includes(c))).toBe(true)
  })
  it("randomHex has length 2*byteLen and is hex", () => {
    const h = randomHex(6)
    expect(h).toHaveLength(12)
    expect(/^[0-9a-f]+$/.test(h)).toBe(true)
  })
})

describe("clamp", () => {
  it("constrains to the range", () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe("stripProtocol", () => {
  it("drops http/https schemes", () => {
    expect(stripProtocol("https://iedora.com/r/x")).toBe("iedora.com/r/x")
    expect(stripProtocol("http://a.b")).toBe("a.b")
    expect(stripProtocol("iedora.com")).toBe("iedora.com")
  })
})

describe("formatMoney", () => {
  it("formats minor units in an explicit locale", () => {
    expect(formatMoney(1250, { currency: "EUR", locale: "en-IE" })).toBe("€12.50")
  })
  it("trims to two decimals from cents", () => {
    expect(formatMoney(100, { currency: "USD", locale: "en-US" })).toBe("$1.00")
  })
})

describe("isValidTimezone", () => {
  it("accepts real zones and rejects junk", () => {
    expect(isValidTimezone("Europe/London")).toBe(true)
    expect(isValidTimezone("Not/AZone")).toBe(false)
  })
})
