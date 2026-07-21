import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto"

import { SignJWT } from "jose"

// EdDSA (Ed25519) access-token issuer + JWKS. Keys are parsed from a base64
// 32-byte seed, so issued tokens verify against the existing JWKS consumers.

// DER PKCS#8 prefix for an Ed25519 private key; the 32-byte seed follows.
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex")

export interface Ed25519Keys {
  privateKey: KeyObject
  publicKey: KeyObject
}

/** Parse a base64 32-byte Ed25519 seed into a Node KeyObject pair. */
export function parseEd25519Seed(base64Seed: string): Ed25519Keys {
  const seed = Buffer.from(base64Seed, "base64")
  if (seed.length !== 32) {
    throw new Error(`expected a 32-byte base64 Ed25519 seed, got ${seed.length} bytes`)
  }
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, seed])
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" })
  return { privateKey, publicKey: createPublicKey(privateKey) }
}

export interface AccessTokenInput {
  userId: string
  email?: string
  /** The product slug (e.g. "menu"), emitted as the `tenant` claim — the top
   *  auth-sdk `AuthClaims` field. Distinct from `org` (the active organization). */
  tenant?: string
  /** The active organization id, emitted as the `org` claim. */
  org?: string
  sessionId?: string
  roles?: string[]
  /** Force-change flag → the `mcp` claim, so a dashboard guard can short-circuit
   *  locally (no DB round-trip). */
  mustChangePassword?: boolean
}

export interface JwtIssuerConfig {
  keys: Ed25519Keys
  kid: string
  issuer: string
  audience: string
  /** jose duration ("15m") or seconds. */
  accessTtl?: string | number
}

/** A single JWK in the JWKS response. */
export interface Jwk {
  kty: string
  crv: string
  x: string
  use: "sig"
  alg: "EdDSA"
  kid: string
}

/** Mints access tokens (typ="access") and serves the JWKS. */
export class JwtIssuer {
  constructor(private readonly cfg: JwtIssuerConfig) {}

  issueAccess(input: AccessTokenInput): Promise<string> {
    return new SignJWT({
      typ: "access",
      roles: input.roles ?? [],
      // The auth-sdk AuthClaims vocabulary: `tenant` = product slug, `org` =
      // active organization. (No legacy `tid`.)
      ...(input.tenant ? { tenant: input.tenant } : {}),
      ...(input.org ? { org: input.org } : {}),
      ...(input.sessionId ? { sid: input.sessionId } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.mustChangePassword ? { mcp: true } : {}),
    })
      .setProtectedHeader({ alg: "EdDSA", kid: this.cfg.kid })
      .setSubject(input.userId)
      .setIssuer(this.cfg.issuer)
      .setAudience(this.cfg.audience)
      .setIssuedAt()
      .setExpirationTime(this.cfg.accessTtl ?? "15m")
      .sign(this.cfg.keys.privateKey)
  }

  /** The JWK Set served at /.well-known/jwks.json. */
  jwks(): { keys: Jwk[] } {
    const jwk = this.cfg.keys.publicKey.export({ format: "jwk" }) as {
      kty: string
      crv: string
      x: string
    }
    return {
      keys: [{ kty: jwk.kty, crv: jwk.crv, x: jwk.x, use: "sig", alg: "EdDSA", kid: this.cfg.kid }],
    }
  }
}
