import { expect, test } from "bun:test";

import { json, lastResetToken, PASSWORD, refreshCookie, registerUser, useHarness, withCookie } from "./harness";

const h = useHarness();

/** Registers a user and returns the live reset token just "emailed" to them. */
async function requestReset(email: string): Promise<string> {
  await registerUser(h, email);
  await h.app.request("/auth/forgot-password", json({ email }));
  return lastResetToken(h);
}

test("forgot-password returns an identical 200 whether or not the account exists (no enumeration)", async () => {
  await registerUser(h, "known@iedora.com");
  const known = await h.app.request("/auth/forgot-password", json({ email: "known@iedora.com" }));
  const unknown = await h.app.request("/auth/forgot-password", json({ email: "nobody@nowhere.test" }));
  expect(known.status).toBe(200);
  expect(unknown.status).toBe(200);
  expect(await known.text()).toBe(await unknown.text());
});

test("forgot-password never returns the token in the HTTP response (out-of-band only)", async () => {
  await registerUser(h, "oob@iedora.com");
  const res = await h.app.request("/auth/forgot-password", json({ email: "oob@iedora.com" }));
  expect(await res.text()).not.toContain("token");
  expect(h.sentResets.at(-1)!.to).toBe("oob@iedora.com");
  expect(h.sentResets.at(-1)!.url).toContain("menu.iedora.com/reset-password");
});

test("a valid token changes the password, revokes all sessions, and does NOT auto-login", async () => {
  const email = "reset@iedora.com";
  const login = await h.app.request("/auth/login", json({ email, password: PASSWORD })); // 401 (not yet registered)
  expect(login.status).toBe(401);

  await registerUser(h, email);
  const live = await h.app.request("/auth/login", json({ email, password: PASSWORD }));
  const oldRefresh = refreshCookie(live)!;

  await h.app.request("/auth/forgot-password", json({ email }));
  const token = lastResetToken(h);
  const newPassword = "a brand new correct horse";
  const reset = await h.app.request("/auth/reset-password", json({ token, password: newPassword }));

  expect(reset.status).toBe(200);
  // No auto-login: no access token in the body, no refresh cookie set.
  expect(((await reset.json()) as { accessToken?: string }).accessToken).toBeUndefined();
  expect(refreshCookie(reset)).toBeUndefined();
  // Referer leak guard.
  expect(reset.headers.get("referrer-policy")).toBe("no-referrer");
  // Pre-existing session revoked (logged out everywhere).
  expect((await h.app.request("/auth/refresh", withCookie(oldRefresh))).status).toBe(401);
  // Old password rejected; the new one works.
  expect((await h.app.request("/auth/login", json({ email, password: PASSWORD }))).status).toBe(401);
  expect((await h.app.request("/auth/login", json({ email, password: newPassword }))).status).toBe(200);
  // A "your password changed" notice was queued.
  expect(h.sentChanged).toContain(email);
});

test("a reset token is single-use", async () => {
  const token = await requestReset("single@iedora.com");
  expect((await h.app.request("/auth/reset-password", json({ token, password: "first new password ok" }))).status).toBe(200);
  expect((await h.app.request("/auth/reset-password", json({ token, password: "second attempt password" }))).status).toBe(400);
});

test("an unknown/garbage token is rejected with 400", async () => {
  expect((await h.app.request("/auth/reset-password", json({ token: "not-a-real-token", password: "whatever password 1" }))).status).toBe(400);
});

test("an expired token is rejected", async () => {
  const token = await requestReset("expired@iedora.com");
  await h.db.db.updateTable("password_reset_tokens").set({ expires_at: new Date(Date.now() - 1000) }).execute();
  expect((await h.app.request("/auth/reset-password", json({ token, password: "after expiry password" }))).status).toBe(400);
});
