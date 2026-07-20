import { expect, test } from "bun:test";

import { json, PASSWORD, registerUser, useHarness } from "./harness";

const h = useHarness();
const email = "login@iedora.com";

test("login with correct credentials returns tokens + a refresh cookie", async () => {
  await registerUser(h, email);
  const res = await h.app.request("/auth/login", json({ email, password: PASSWORD }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { accessToken: string; refreshToken: string };
  expect(body.accessToken).toBeTruthy();
  expect(body.refreshToken).toBeTruthy();
});

test("bad password is 401", async () => {
  await registerUser(h, "login2@iedora.com");
  expect((await h.app.request("/auth/login", json({ email: "login2@iedora.com", password: "nope" }))).status).toBe(401);
});

test("unknown email is 401", async () => {
  expect((await h.app.request("/auth/login", json({ email: "ghost@iedora.com", password: PASSWORD }))).status).toBe(401);
});
