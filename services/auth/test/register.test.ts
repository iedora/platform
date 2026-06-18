import { expect, test } from "bun:test";

import { json, PASSWORD, refreshCookie, useHarness } from "./harness";

const h = useHarness();
const creds = { email: "a@iedora.com", password: PASSWORD, name: "A" };

test("register issues tokens + a refresh cookie", async () => {
  const res = await h.app.request("/auth/register", json(creds));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { accessToken: string; userId: string };
  expect(body.accessToken).toBeTruthy();
  expect(body.userId).toBeTruthy();
  expect(refreshCookie(res)).toBeTruthy();
});

test("duplicate email is rejected (409)", async () => {
  await h.app.request("/auth/register", json(creds));
  expect((await h.app.request("/auth/register", json(creds))).status).toBe(409);
});
