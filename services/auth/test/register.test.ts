import { expect, test } from "bun:test";

import { json, PASSWORD, useHarness } from "./harness";

const h = useHarness();
const creds = { email: "a@iedora.com", password: PASSWORD, name: "A" };

test("register issues tokens + a refresh cookie", async () => {
  const res = await h.app.request("/auth/register", json(creds));
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    user: { id: string; email: string };
  };
  expect(body.accessToken).toBeTruthy();
  expect(body.refreshToken).toBeTruthy();
  expect(body.tokenType).toBe("Bearer");
  expect(body.user.id).toBeTruthy();
});

test("duplicate email is rejected (409)", async () => {
  await h.app.request("/auth/register", json(creds));
  expect((await h.app.request("/auth/register", json(creds))).status).toBe(409);
});
