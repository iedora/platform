import { describe, expect, test } from "bun:test"

import {
  hasRole,
  hashPassword,
  JwtIssuer,
  newServiceVerifier,
  newUserVerifier,
  parseClients,
  parseEd25519PublicKey,
  parseEd25519Seed,
  ServiceTokenIssuer,
  verifyAccessToken,
  verifyPassword,
  verifyServiceToken,
} from "../../src/index.ts"

const SEED = Buffer.from(new Uint8Array(32).fill(7)).toString("base64")

describe("password", () => {
  test("hash + verify roundtrip", async () => {
    const phc = await hashPassword("supersecret1")
    expect(phc).toStartWith("$argon2id$")
    expect(await verifyPassword(phc, "supersecret1")).toBe(true)
    expect(await verifyPassword(phc, "wrong")).toBe(false)
  })
})

describe("jwt (access) issue + verify", () => {
  test("issues an access token verifiable by userAuth's verifier", async () => {
    const keys = parseEd25519Seed(SEED)
    const issuer = new JwtIssuer({ keys, kid: "k1", issuer: "iss", audience: "aud" })
    const token = await issuer.issueAccess({ userId: "u1", roles: ["owner"], email: "a@b.c" })
    const pub = keys.publicKey
    const v = newUserVerifier(pub, "iss", "aud")
    const p = await verifyAccessToken(v, token)
    expect(p.userId).toBe("u1")
    expect(p.email).toBe("a@b.c")
    expect(hasRole(p, "owner")).toBe(true)
    expect(hasRole(p, "admin")).toBe(false)
    // jwks shape
    expect(issuer.jwks().keys[0]!.kid).toBe("k1")
  })
})

describe("service tokens", () => {
  test("issue + verify roundtrip (typ=service)", async () => {
    const keys = parseEd25519Seed(SEED)
    const issuer = new ServiceTokenIssuer({ privateKey: keys.privateKey, kid: "k1", issuer: "iss", audience: "svc" })
    const token = await issuer.issue("bff")
    const pubStd = Buffer.from(keys.publicKey.export({ format: "jwk" }) && new Uint8Array(0)) // placeholder
    const v = newServiceVerifier(keys.publicKey, "iss", "svc")
    expect(await verifyServiceToken(v, token)).toBe("bff")
    void pubStd
    void parseEd25519PublicKey
  })
  test("parseClients", () => {
    const m = parseClients("a:1, b:2")
    expect(m.get("a")).toBe("1")
    expect(m.get("b")).toBe("2")
  })
})
