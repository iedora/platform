import { describe, expect, test } from "vitest"

import { emitLog, traceIds } from "../src/otel.ts"

// The OTel SDK wiring comes from @iedora/observability (NodeSDK) and the HTTP span
// from @hono/otel — both tested upstream. Tenant attribution lives in
// @iedora/observability too. What's here is the generic log/trace helpers being
// safe when OTel was never registered.

describe("otel helpers (safe when OTel is off)", () => {
  test("traceIds is undefined with no active span", () => {
    expect(traceIds()).toBeUndefined()
  })
  test("emitLog does not throw", () => {
    expect(() => emitLog("info", "hello", { k: "v" })).not.toThrow()
  })
})
