import crypto from "node:crypto"
import {
  calculateJwkThumbprint,
  exportJWK,
  importJWK,
  type JWK,
  type KeyLike,
  jwtVerify,
  SignJWT,
} from "jose"

import { config } from "./config"
import type { Tenant, User } from "./schema"

type SigningKey = {
  kid: string
  privateKey: KeyLike
  publicJwk: JWK
}

// Ed25519 PKCS8 DER prefix; prepend to a 32-byte seed to import a key
// deterministically via Web Crypto (jose in Bun works with CryptoKey, not KeyObject).
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex")
const subtle = crypto.webcrypto.subtle

async function keyFromSeed(seedB64url: string): Promise<SigningKey> {
  const seed = Buffer.from(seedB64url, "base64url")
  if (seed.length !== 32) throw new Error("JWT signing seed must be 32 bytes (base64url)")

  const privateKey = (await subtle.importKey(
    "pkcs8",
    Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    { name: "Ed25519" },
    true,
    ["sign"],
  )) as unknown as KeyLike

  // Public jwk = private jwk without `d`.
  const { d: _priv, ...publicJwk } = (await exportJWK(privateKey)) as JWK
  const kid = await calculateJwkThumbprint(publicJwk)
  publicJwk.kid = kid
  publicJwk.alg = "EdDSA"
  publicJwk.use = "sig"
  return { kid, privateKey, publicJwk }
}

async function loadKeys(): Promise<SigningKey[]> {
  if (config.signingKeySeeds.length > 0) {
    return Promise.all(config.signingKeySeeds.map(keyFromSeed))
  }
  console.warn("[auth] JWT_SIGNING_KEYS unset — using an ephemeral in-memory key")
  return [await keyFromSeed(crypto.randomBytes(32).toString("base64url"))]
}

const keys = await loadKeys()
const signer = keys[0]! // newest key signs; all keys are published for verify

function accessTtl(tenant: Tenant): number {
  return tenant.accessTtl ?? config.accessTtl
}

/** Extra, session-scoped claims layered onto the access token at issue time. */
export type AccessClaimsInput = {
  /** Session family id — stable across refresh rotation (the `sid` claim). */
  sid: string
  /** Active organization id for this session, if the user has selected one. */
  org?: string | null
  /** The user's roles in the active organization. */
  roles?: string[]
  /** Authentication methods, e.g. ["pwd"] or ["oauth"]. */
  amr?: string[]
}

/** Sign an access token. Claims are generic so any consumer (iedora service or
 *  external) can verify with just JWKS: standard `iss/aud/sub/exp`, plus `tenant`
 *  (slug), `email`/`name`, the session `sid`, the active `org` + `roles`, `amr`,
 *  and `mcp` when a password change is required. */
export async function signAccessToken(
  tenant: Tenant,
  user: User,
  input: AccessClaimsInput,
): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = accessTtl(tenant)
  // Org roles from the active membership, plus the global platform:admin grant
  // (email-based, so it rides in every tenant's token for a super-admin). Added
  // here — the one choke point both login and refresh pass through.
  const roles = [...(input.roles ?? [])]
  if (config.platformAdmins.includes(user.email.toLowerCase())) roles.push("platform:admin")
  const claims: Record<string, unknown> = {
    tenant: tenant.slug,
    email: user.email,
    name: user.name,
    sid: input.sid,
    org: input.org ?? null,
    roles,
    amr: input.amr ?? [],
  }
  // Only present when true, so a normal token stays lean.
  if (user.mustChangePassword) claims.mcp = true
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: signer.kid })
    .setIssuer(config.issuerUrl)
    .setAudience(tenant.tokenAudience)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(signer.privateKey)
  return { token, expiresIn }
}

/** Sign a machine-to-machine token (client-credentials grant). `typ:"service"`
 *  + the service audience is what the admin API's guard checks; `tid` scopes a
 *  tenant-bound client to its tenant. */
export async function signServiceToken(
  clientId: string,
  audience: string,
  tenantId: string | null,
): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = config.serviceTokenTtl
  const claims: Record<string, unknown> = { typ: "service" }
  if (tenantId) claims.tid = tenantId
  // Read-only clients get the `readonly` claim; every service refuses their
  // non-GET requests (see withService / server-kit serviceAuth).
  if (config.readonlyClients.includes(clientId)) claims.readonly = true
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: signer.kid })
    .setIssuer(config.issuerUrl)
    .setAudience(audience)
    .setSubject(clientId)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(signer.privateKey)
  return { token, expiresIn }
}

/** Verify a token this service issued (for /whoami). External consumers should
 *  verify via JWKS themselves rather than call back here. */
export async function verifyAccessToken(token: string) {
  let lastErr: unknown
  for (const k of keys) {
    try {
      const pub = await importJWK(k.publicJwk, "EdDSA")
      const { payload } = await jwtVerify(token, pub, { issuer: config.issuerUrl })
      return payload
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error("invalid token")
}

/** Public JWKS — every key, so rotation never breaks in-flight tokens. */
export function jwks() {
  return { keys: keys.map((k) => k.publicJwk) }
}

/** Minimal OIDC discovery document so standard clients can auto-configure. */
export function discovery() {
  const base = config.issuerUrl
  return {
    issuer: base,
    jwks_uri: `${base}/.well-known/jwks.json`,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    userinfo_endpoint: `${base}/userinfo`,
    id_token_signing_alg_values_supported: ["EdDSA"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token", "password"],
    subject_types_supported: ["public"],
    scopes_supported: ["openid", "email", "profile"],
  }
}

/* ---------------------------- opaque secrets ------------------------------ */

/** SHA-256 (hex) of an opaque token — what we persist, so a DB leak can't be
 *  replayed. Used for refresh tokens and password-reset tokens alike. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

/** A random secret handed to the client + the hash to store. */
export function newOpaqueToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url")
  return { token, hash: hashToken(token) }
}

// Back-compat names used by the refresh/session code.
export const newRefreshToken = newOpaqueToken
export const hashRefreshToken = hashToken
