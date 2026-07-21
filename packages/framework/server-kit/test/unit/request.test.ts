import { describe, expect, test } from "bun:test"
import type { Context } from "hono"

import { readBearer, reqContext } from "../../src/request.ts"

const ctx = (headers: Record<string, string>) =>
  ({ req: { header: (k: string) => headers[k.toLowerCase()] } }) as unknown as Context

describe("reqContext", () => {
  test("takes the first x-forwarded-for hop", () => {
    expect(reqContext(ctx({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "user-agent": "UA" }))).toEqual({
      ip: "1.2.3.4",
      userAgent: "UA",
    })
  })

  test("nulls when headers are absent", () => {
    expect(reqContext(ctx({}))).toEqual({ ip: null, userAgent: null })
  })
})

describe("readBearer", () => {
  test("extracts the token after 'Bearer '", () => {
    expect(readBearer(ctx({ authorization: "Bearer abc.def" }))).toBe("abc.def")
  })

  test("undefined without a Bearer prefix or header", () => {
    expect(readBearer(ctx({ authorization: "Basic x" }))).toBeUndefined()
    expect(readBearer(ctx({}))).toBeUndefined()
  })
})
