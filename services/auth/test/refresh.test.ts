import { expect, test } from "bun:test";

import { json, PASSWORD, refreshTokenOf, registerUser, useHarness, withRefresh } from "./harness";

const h = useHarness();
const email = "refresh@iedora.com";

test("refresh rotates the token; the old token is reuse-detected and burns the family", async () => {
  await registerUser(h, email);
  const loginRes = await h.app.request("/auth/login", json({ email, password: PASSWORD }));
  const c1 = (await refreshTokenOf(loginRes))!;
  expect(c1).toBeTruthy();

  const r1 = await h.app.request("/auth/refresh", withRefresh(c1));
  expect(r1.status).toBe(200);
  const c2 = (await refreshTokenOf(r1))!;
  expect(c2).toBeTruthy();
  expect(c2).not.toBe(c1);

  // Replaying the rotated first token → reuse detected → 401…
  expect((await h.app.request("/auth/refresh", withRefresh(c1))).status).toBe(401);
  // …and the family is burned, so the successor is dead too.
  expect((await h.app.request("/auth/refresh", withRefresh(c2))).status).toBe(401);
});
