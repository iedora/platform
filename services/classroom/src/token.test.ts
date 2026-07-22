import { SignJWT } from "jose"
import { describe, expect, it } from "vitest"

import { RoomTokenError, verifyRoomToken } from "./token.ts"

const secret = new TextEncoder().encode("test-secret-that-is-at-least-32-bytes")
const otherSecret = new TextEncoder().encode("a-different-secret-of-sufficient-len!")

// Real clock: jose's jwtVerify enforces nbf/exp against the actual current time,
// so the token window must bracket "now".
const nowSec = () => Math.floor(Date.now() / 1000)

const mint = (
  claims: Record<string, unknown>,
  window: { nbf?: number; exp?: number } = {},
  key: Uint8Array = secret,
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(nowSec())
    .setNotBefore(window.nbf ?? nowSec() - 60)
    .setExpirationTime(window.exp ?? nowSec() + 600)
    .sign(key)

const base = { spaceId: "lesson-1", uid: "u1", name: "Ada", leader: true, room: "Ada & Grace" }

describe("verifyRoomToken", () => {
  it("returns the claims for a valid token", async () => {
    const claims = await verifyRoomToken(await mint(base), secret)
    expect(claims).toEqual(base)
  })

  it("rejects a token signed with a different secret", async () => {
    await expect(verifyRoomToken(await mint(base, {}, otherSecret), secret)).rejects.toBeInstanceOf(RoomTokenError)
  })

  it("rejects an expired token", async () => {
    await expect(verifyRoomToken(await mint(base, { exp: nowSec() - 10 }), secret)).rejects.toBeInstanceOf(RoomTokenError)
  })

  it("rejects a token before its not-before window", async () => {
    await expect(verifyRoomToken(await mint(base, { nbf: nowSec() + 3600 }), secret)).rejects.toBeInstanceOf(
      RoomTokenError,
    )
  })

  it("rejects a token missing required claims", async () => {
    await expect(verifyRoomToken(await mint({ spaceId: "x", name: "n", leader: true }), secret)).rejects.toBeInstanceOf(
      RoomTokenError,
    )
  })

  it("rejects garbage", async () => {
    await expect(verifyRoomToken("not-a-jwt", secret)).rejects.toBeInstanceOf(RoomTokenError)
  })
})
