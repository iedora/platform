import type { webcrypto } from "node:crypto"
import type { KeyObject } from "node:crypto"

import { createMiddleware } from "hono/factory"
import { importJWK, type JWTPayload, SignJWT } from "jose"

import { verifyJwt, type VerifyKey } from "./jwks.ts"

// Verify the internal service tokens minted for the client-credentials grant
// (EdDSA): algorithm pinned (algorithm-confusion defense), issuer + audience
// checked, and the `typ=="service"` guard so a user token can't be replayed.

/** Hono environment for internal (service-token) services: serviceAuth sets `clientId`. */
export interface ServiceEnv {
  Variables: { clientId: string }
}

export interface ServiceVerifier {
  key: VerifyKey
  issuer: string
  audience: string
}

/** Import a shared Ed25519 public key from its base64 (std) raw 32-byte form. */
export async function parseEd25519PublicKey(base64Std: string): Promise<webcrypto.CryptoKey | Uint8Array> {
  const raw = Buffer.from(base64Std, "base64")
  const x = Buffer.from(raw).toString("base64url")
  return importJWK({ kty: "OKP", crv: "Ed25519", x, alg: "EdDSA" }, "EdDSA")
}

export function newServiceVerifier(
  key: VerifyKey,
  issuer: string,
  audience: string,
): ServiceVerifier {
  return { key, issuer, audience }
}

/** Verify a service token and return the client id (sub). Throws on failure. */
export async function verifyServiceToken(v: ServiceVerifier, token: string): Promise<string> {
  const { payload } = await verifyJwt(token, v.key, {
    issuer: v.issuer,
    audience: v.audience,
    algorithms: ["EdDSA"],
  })
  if (payload.typ !== "service") throw new Error("not a service token")
  if (!payload.sub) throw new Error("service token missing subject")
  return payload.sub
}

export interface ServiceIssuerConfig {
  privateKey: webcrypto.CryptoKey | KeyObject
  kid: string
  issuer: string
  audience: string
  ttl?: string | number // jose duration; default "10m"
}

/** Mints internal service tokens (EdDSA, typ="service") for client-credentials. */
export class ServiceTokenIssuer {
  private readonly cfg: ServiceIssuerConfig;

  constructor(cfg: ServiceIssuerConfig) {
    this.cfg = cfg;
  }

  issue(clientId: string): Promise<string> {
    return new SignJWT({ typ: "service" })
      .setProtectedHeader({ alg: "EdDSA", kid: this.cfg.kid })
      .setSubject(clientId)
      .setIssuer(this.cfg.issuer)
      .setAudience(this.cfg.audience)
      .setIssuedAt()
      .setExpirationTime(this.cfg.ttl ?? "10m")
      .sign(this.cfg.privateKey)
  }
}

/** Parse the "id1:secret1,id2:secret2" client registry. */
export function parseClients(s: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const pair of s.split(",")) {
    const [id, secret] = pair.split(":")
    if (id?.trim() && secret?.trim()) m.set(id.trim(), secret.trim())
  }
  return m
}

/**
 * Hono middleware: 401 unless a valid service bearer token is present; sets
 * `clientId`. Also enforces read-only tokens (the `readonly` claim, minted by
 * auth for read-only clients): a read-only token may only make safe reads — any
 * non-GET request is refused with 403 — UNLESS the route opts in with
 * `allowReadonly` (e.g. audit ingest, which a read-only console still needs to
 * log its own reads). Normal tokens (no `readonly` claim) are unaffected.
 */
export function serviceAuth(v: ServiceVerifier, opts: { allowReadonly?: boolean } = {}) {
  return createMiddleware<ServiceEnv>(async (c, next) => {
    const header = c.req.header("authorization") ?? ""
    const token = header.startsWith("Bearer ") ? header.slice(7) : ""
    if (!token) return c.json({ error: "missing bearer token" }, 401)

    let payload: JWTPayload
    try {
      payload = (await verifyJwt(token, v.key, {
        issuer: v.issuer,
        audience: v.audience,
        algorithms: ["EdDSA"],
      })).payload
      if (payload.typ !== "service" || !payload.sub) throw new Error("not a service token")
    } catch {
      return c.json({ error: "invalid service token" }, 401)
    }

    const write = c.req.method !== "GET" && c.req.method !== "HEAD"
    if (payload.readonly === true && write && !opts.allowReadonly) {
      return c.json({ error: "read_only_token" }, 403)
    }

    c.set("clientId", payload.sub)
    await next()
  })
}
