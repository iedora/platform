import { afterEach, beforeAll, describe, expect, test } from "bun:test"

import { context, propagation } from "@opentelemetry/api"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"

// context.with() only propagates once a real context manager is installed;
// the API default is a no-op manager. register() installs one via NodeSDK in
// production — install it here so the baggage assertions are deterministic.
beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
})

import {
  __resetForTest,
  logger,
  meter,
  register,
  shutdown,
  tracer,
  withContextAttributes,
} from "../../src/index.ts"

afterEach(() => {
  __resetForTest()
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
})

describe("register (ships dark)", () => {
  test("no endpoint → no-op, does not throw, stays resettable", () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    expect(() => register({ serviceName: "test" })).not.toThrow()
  })

  test("idempotent — second call is a no-op", () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    register({ serviceName: "test" })
    expect(() => register({ serviceName: "test" })).not.toThrow()
  })

  test("shutdown is safe when nothing was registered", async () => {
    await expect(shutdown()).resolves.toBeUndefined()
  })
})

describe("signal accessors", () => {
  test("tracer/meter/logger are callable before registration (no-op)", () => {
    expect(typeof tracer().startSpan).toBe("function")
    expect(typeof meter().createCounter).toBe("function")
    expect(typeof logger().emit).toBe("function")
  })

  test("a no-op span can be started and ended", () => {
    const span = tracer().startSpan("noop")
    expect(() => span.end()).not.toThrow()
  })
})

describe("withContextAttributes", () => {
  test("sets baggage entries readable inside the callback", () => {
    withContextAttributes({ "app.org_id": "org_1", "app.plan": "pro" }, () => {
      const bag = propagation.getBaggage(context.active())
      expect(bag?.getEntry("app.org_id")?.value).toBe("org_1")
      expect(bag?.getEntry("app.plan")?.value).toBe("pro")
    })
  })

  test("does not leak outside the callback", () => {
    withContextAttributes({ "app.org_id": "org_1" }, () => {})
    expect(propagation.getBaggage(context.active())?.getEntry("app.org_id")).toBeUndefined()
  })

  test("merges onto existing baggage (nested)", () => {
    withContextAttributes({ "app.a": "1" }, () => {
      withContextAttributes({ "app.b": "2" }, () => {
        const bag = propagation.getBaggage(context.active())
        expect(bag?.getEntry("app.a")?.value).toBe("1")
        expect(bag?.getEntry("app.b")?.value).toBe("2")
      })
    })
  })

  test("forwards the callback return value", () => {
    const out = withContextAttributes({ "app.a": "1" }, () => 42)
    expect(out).toBe(42)
  })
})
