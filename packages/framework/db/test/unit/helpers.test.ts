import { describe, expect, test } from "bun:test"

import { isInvalidText, iso, isoOpt, isUniqueViolation, sqlState } from "../../src/index"

describe("pg error helpers", () => {
  test("sqlState reads errno", () => {
    expect(sqlState({ errno: "23505" })).toBe("23505")
    expect(sqlState(new Error("x"))).toBeUndefined()
    expect(sqlState(null)).toBeUndefined()
  })
  test("classifiers", () => {
    expect(isUniqueViolation({ errno: "23505" })).toBe(true)
    expect(isUniqueViolation({ errno: "23503" })).toBe(false)
    expect(isInvalidText({ errno: "22P02" })).toBe(true)
  })
})

describe("date helpers", () => {
  test("iso", () => {
    expect(iso(new Date("2020-01-02T03:04:05.000Z"))).toBe("2020-01-02T03:04:05.000Z")
    expect(iso("2020-01-02")).toBe("2020-01-02")
  })
  test("isoOpt", () => {
    expect(isoOpt(null)).toBeUndefined()
    expect(isoOpt(undefined)).toBeUndefined()
    expect(isoOpt(new Date("2020-01-02T03:04:05.000Z"))).toBe("2020-01-02T03:04:05.000Z")
  })
})

import { withSearchPath } from "../../src/index"

describe("withSearchPath", () => {
  test("appends search_path option", () => {
    expect(withSearchPath("postgres://h/db", "menu")).toBe(
      "postgres://h/db?options=-c%20search_path%3Dmenu",
    )
  })
  test("uses & when the url already has a query", () => {
    expect(withSearchPath("postgres://h/db?sslmode=disable", "auth")).toBe(
      "postgres://h/db?sslmode=disable&options=-c%20search_path%3Dauth",
    )
  })
  test("no schema → url unchanged", () => {
    expect(withSearchPath("postgres://h/db", undefined)).toBe("postgres://h/db")
  })
  test("rejects an unsafe schema name", () => {
    expect(() => withSearchPath("postgres://h/db", "a;drop")).toThrow()
  })
})
