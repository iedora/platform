import { expect, test } from "vitest";
import { jwtVerify } from "jose";

import { JwtIssuer, hashPassword, parseEd25519Seed, verifyPassword } from "../src/index.ts";

// The dev keypair (auth's API_JWT_PRIVATE_KEY seed + its public key).
const SEED = "4qiWAUBUtlk6abEM+o0urqz3tGcSVjg8f/NyRa5wWeI=";
const PUB_B64URL = Buffer.from("M+/u/gPyq9NyuwfMjS82Y7lOJeyvGq6jpeRxMqr1Ge4=", "base64").toString(
  "base64url",
);

test("argon2id password hash round-trips and rejects wrong passwords", async () => {
  const phc = await hashPassword("correct horse battery staple");
  expect(phc.startsWith("$argon2id$")).toBe(true);
  expect(await verifyPassword(phc, "correct horse battery staple")).toBe(true);
  expect(await verifyPassword(phc, "wrong password")).toBe(false);
});

test("JwtIssuer mints an EdDSA access token verifiable via its JWKS", async () => {
  const keys = parseEd25519Seed(SEED);
  const issuer = new JwtIssuer({
    keys,
    kid: "k1",
    issuer: "https://api.iedora.com",
    audience: "iedora-api",
  });

  const token = await issuer.issueAccess({
    userId: "u-1",
    email: "a@b.c",
    org: "t-1",
    roles: ["staff"],
  });

  const { payload } = await jwtVerify(token, keys.publicKey, {
    issuer: "https://api.iedora.com",
    audience: "iedora-api",
    algorithms: ["EdDSA"],
  });
  expect(payload.sub).toBe("u-1");
  expect(payload.typ).toBe("access");
  expect(payload.org).toBe("t-1");
  expect(payload.roles).toEqual(["staff"]);

  // JWKS is well-formed and its key matches the dev public key (cross-verify).
  const jwk = issuer.jwks().keys[0]!;
  expect(jwk.kty).toBe("OKP");
  expect(jwk.crv).toBe("Ed25519");
  expect(jwk.alg).toBe("EdDSA");
  expect(jwk.x).toBe(PUB_B64URL);
});
