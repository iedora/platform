import type { KeyObject, webcrypto } from "node:crypto"

import { createRemoteJWKSet, type JWTVerifyGetKey, type JWTVerifyOptions, type JWTVerifyResult, jwtVerify } from "jose"

// What a token verifier holds as its key: either a static public key, or a JWKS
// resolver (from `remoteJwks`) that fetches keys by id from the issuer.
export type VerifyKey = webcrypto.CryptoKey | Uint8Array | KeyObject | JWTVerifyGetKey

/**
 * A remote JWKS resolver: fetches (and caches, with cooldown) the signing keys
 * from an auth service's JWKS endpoint, so consumers verify by key id instead of
 * a pinned static key — key rotation on the issuer just works, no consumer
 * redeploy.
 *
 *   newUserVerifier(remoteJwks(cfg.authJwksUrl), issuer, audience)
 */
export function remoteJwks(url: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(url))
}

// jose's jwtVerify is overloaded (static key vs JWKS resolver); a union spanning
// both overloads matches neither, so branch on the resolver (a function) to pick
// the right overload. Callers use one signature regardless of key kind.
export function verifyJwt(token: string, key: VerifyKey, options: JWTVerifyOptions): Promise<JWTVerifyResult> {
  return typeof key === "function" ? jwtVerify(token, key, options) : jwtVerify(token, key, options)
}
