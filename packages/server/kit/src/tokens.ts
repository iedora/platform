import { createHash, randomBytes } from "node:crypto";

// Opaque refresh tokens:
// token = base64url(32 random bytes) (no padding); stored form = raw sha256(token)
// bytes (the sessions.token_hash bytea column), never an encoded string.
const REFRESH_TOKEN_BYTES = 32;

export function newRefreshToken(): { token: string; hash: Buffer } {
  const token = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

/** Hashes a presented refresh token for the sessions.token_hash lookup. */
export function hashRefreshToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}
