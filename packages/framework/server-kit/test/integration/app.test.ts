import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { z } from "zod"

import { bearerAuth, HttpError, onError, up, validate } from "../../src/index.ts"

function makeApp() {
  const app = new Hono()
  app.onError(onError)
  app.get("/up", up)
  app.post("/echo", validate("json", z.object({ name: z.string().min(2) })), (c) =>
    c.json({ hi: c.req.valid("json").name }),
  )
  app.get("/boom", () => {
    throw new HttpError(418, "teapot", "no coffee")
  })
  app.get("/kaboom", () => {
    throw new Error("unexpected")
  })
  const guard = bearerAuth((t) => {
    if (t !== "secret") throw new HttpError(401, "bad_token")
    return { sub: "u1" }
  })
  app.get("/me", guard, (c) => c.json(c.get("auth" as never) as { sub: string }))
  return app
}

describe("server-kit over Hono (in-memory requests)", () => {
  const app = makeApp()

  test("up returns ok", async () => {
    const r = await app.request("/up")
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })

  test("validate rejects a bad body with 422 invalid_input", async () => {
    const r = await app.request("/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    })
    expect(r.status).toBe(422)
    expect(((await r.json()) as { error?: string }).error).toBe("invalid_input")
  })

  test("validate passes a valid body through", async () => {
    const r = await app.request("/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ann" }),
    })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ hi: "Ann" })
  })

  test("onError shapes an HttpError", async () => {
    const r = await app.request("/boom")
    expect(r.status).toBe(418)
    expect(await r.json()).toEqual({ error: "teapot", message: "no coffee" })
  })

  test("onError turns an unexpected throw into 500 internal_error", async () => {
    const r = await app.request("/kaboom")
    expect(r.status).toBe(500)
    expect(((await r.json()) as { error?: string }).error).toBe("internal_error")
  })

  test("bearerAuth 401s without a token", async () => {
    const r = await app.request("/me")
    expect(r.status).toBe(401)
    expect(((await r.json()) as { error?: string }).error).toBe("missing_token")
  })

  test("bearerAuth 401s on a rejected token", async () => {
    const r = await app.request("/me", { headers: { authorization: "Bearer nope" } })
    expect(r.status).toBe(401)
    expect(((await r.json()) as { error?: string }).error).toBe("bad_token")
  })

  test("bearerAuth stores the verified caller on valid token", async () => {
    const r = await app.request("/me", { headers: { authorization: "Bearer secret" } })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ sub: "u1" })
  })
})
