import { expect, test } from "bun:test";

import { bearer, registerUser, useHarness } from "./harness";

// Whoami slice: echoes the identity decoded from the caller's access token.
const h = useHarness();

test("whoami echoes the signed-in user's identity", async () => {
  const { access } = await registerUser(h, "who@iedora.test");
  const res = await h.app.request("/auth/whoami", bearer(access));
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    sub: string;
    email: string | null;
    tenant: string;
    org: string | null;
    roles: string[];
    mustChangePassword: boolean;
  };
  expect(body.sub).toBeTruthy();
  expect(body.email).toBe("who@iedora.test");
  expect(body.tenant).toBe("menu");
  expect(Array.isArray(body.roles)).toBe(true);
});

test("whoami without a token is 401", async () => {
  expect((await h.app.request("/auth/whoami")).status).toBe(401);
});
