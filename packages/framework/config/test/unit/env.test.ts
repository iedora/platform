import { describe, expect, test } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { boolEnv, durationMs, env, expandFileSecrets, isProd, numEnv, requireEnv } from "../../src/index.ts"

describe("env readers", () => {
  test("requireEnv throws when missing", () => {
    expect(() => requireEnv("X_MISSING", {})).toThrow("X_MISSING is required")
    expect(requireEnv("X", { X: "v" })).toBe("v")
  })
  test("env fallback", () => {
    expect(env("X", "def", {})).toBe("def")
    expect(env("X", "def", { X: "v" })).toBe("v")
  })
  test("numEnv + boolEnv", () => {
    expect(numEnv("N", 5, {})).toBe(5)
    expect(numEnv("N", 5, { N: "42" })).toBe(42)
    expect(numEnv("N", 5, { N: "nope" })).toBe(5)
    expect(boolEnv("B", false, { B: "true" })).toBe(true)
    expect(boolEnv("B", true, { B: "0" })).toBe(false)
  })
  test("isProd", () => {
    expect(isProd({ DEPLOYMENT_ENV: "production" })).toBe(true)
    expect(isProd({ DEPLOYMENT_ENV: "dev" })).toBe(false)
  })
})

describe("durationMs", () => {
  test("parses units", () => {
    expect(durationMs("500ms", 0)).toBe(500)
    expect(durationMs("90s", 0)).toBe(90_000)
    expect(durationMs("15m", 0)).toBe(900_000)
    expect(durationMs("2h", 0)).toBe(7_200_000)
    expect(durationMs("1d", 0)).toBe(86_400_000)
  })
  test("fallback on garbage", () => {
    expect(durationMs("nope", 123)).toBe(123)
  })
})

describe("expandFileSecrets", () => {
  test("reads <NAME>_FILE into <NAME>, explicit value wins", () => {
    const dir = mkdtempSync(join(tmpdir(), "cfg-"))
    const path = join(dir, "secret")
    writeFileSync(path, "  hunter2\n")
    const e: NodeJS.ProcessEnv = { A_FILE: path, B_FILE: path, B: "explicit" }
    expandFileSecrets(e)
    expect(e.A).toBe("hunter2")
    expect(e.A_FILE).toBeUndefined()
    expect(e.B).toBe("explicit") // explicit wins
  })
})
