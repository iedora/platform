import { expect, test } from "bun:test";

import { useHarness } from "./harness";

const h = useHarness();

test("JWKS serves the EdDSA public key", async () => {
  const res = await h.app.request("/auth/.well-known/jwks.json");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { keys: { kty: string; crv: string }[] };
  expect(body.keys[0]!.kty).toBe("OKP");
  expect(body.keys[0]!.crv).toBe("Ed25519");
});
