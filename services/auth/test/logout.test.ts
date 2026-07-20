import { expect, test } from "bun:test";

import { bearer, json, PASSWORD, refreshTokenOf, registerUser, useHarness, withRefresh } from "./harness";

const h = useHarness();

test("logout revokes the session (this device)", async () => {
  await registerUser(h, "logout@iedora.com");
  const loginRes = await h.app.request("/auth/login", json({ email: "logout@iedora.com", password: PASSWORD }));
  const c = (await refreshTokenOf(loginRes))!;
  expect((await h.app.request("/auth/logout", withRefresh(c))).status).toBe(200);
  expect((await h.app.request("/auth/refresh", withRefresh(c))).status).toBe(401);
});

test("logout-all revokes every device session", async () => {
  const { access, cookie } = await registerUser(h, "logoutall@iedora.com");
  const res = await h.app.request("/auth/logout-all", { method: "POST", ...bearer(access) });
  expect(res.status).toBe(200);
  expect((await h.app.request("/auth/refresh", withRefresh(cookie!))).status).toBe(401);
});
