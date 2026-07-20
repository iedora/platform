import { expect, test } from "bun:test";

import { claims, json, PASSWORD, registerUser, useHarness } from "./harness";

// Self-service + admin password lifecycle: voluntary change (needs current pw),
// admin force-change-at-next-login (login signals it, the forced change skips
// the current pw), admin set-temporary-password, and device kick.
const h = useHarness();

const NEWPW = "a-brand-new-password-123";
const TEMP = "temporary-admin-set-pw-9";

const uid = (access: string) => (claims(access) as { sub?: string }).sub ?? "";
const userPost = (access: string, path: string, body: unknown) =>
  h.app.request(path, {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const svcPost = (path: string, body?: unknown) =>
  h.app.request(path, {
    method: "POST",
    headers: { authorization: `Bearer ${h.serviceToken}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test("voluntary change-password requires the correct current password", async () => {
  const { access } = await registerUser(h, "chg@iedora.com");
  expect((await userPost(access, "/auth/change-password", { newPassword: NEWPW })).status).toBe(422);
  expect(
    (await userPost(access, "/auth/change-password", { currentPassword: "wrong-wrong-wrong", newPassword: NEWPW }))
      .status,
  ).toBe(403);
  expect(
    (await userPost(access, "/auth/change-password", { currentPassword: PASSWORD, newPassword: NEWPW })).status,
  ).toBe(200);
  // The old password no longer works; the new one does.
  expect((await h.app.request("/auth/login", json({ email: "chg@iedora.com", password: PASSWORD }))).status).toBe(401);
  expect((await h.app.request("/auth/login", json({ email: "chg@iedora.com", password: NEWPW }))).status).toBe(200);
});

test("admin force-change: login still works, signals mustChangePassword, forced change skips the current pw", async () => {
  const { access } = await registerUser(h, "force@iedora.com");
  expect((await svcPost(`/auth/admin/users/${uid(access)}/force-password-change`)).status).toBe(200);

  // The user signs in with their CURRENT password; the forced-change flag rides
  // the access token's `mcp` claim (the AuthSession body carries no such field),
  // so the dashboard guard short-circuits locally with no DB round-trip.
  const login = await h.app.request("/auth/login", json({ email: "force@iedora.com", password: PASSWORD }));
  expect(login.status).toBe(200);
  const body = (await login.json()) as { accessToken: string };
  expect((claims(body.accessToken) as { mcp?: boolean }).mcp).toBe(true);

  // Forced change needs only the new password.
  expect((await userPost(body.accessToken, "/auth/change-password", { newPassword: NEWPW })).status).toBe(200);
  // Next login is clean (flag cleared) and uses the new password.
  const after = await h.app.request("/auth/login", json({ email: "force@iedora.com", password: NEWPW }));
  const afterBody = (await after.json()) as { accessToken: string };
  expect((claims(afterBody.accessToken) as { mcp?: boolean }).mcp).toBeUndefined();
});

test("admin set-password: the user signs in with the temp password and must change it", async () => {
  const { access } = await registerUser(h, "setpw@iedora.com");
  expect((await svcPost(`/auth/admin/users/${uid(access)}/set-password`, { password: TEMP })).status).toBe(200);
  // Old password is dead; the temp one works and is flagged for change.
  expect((await h.app.request("/auth/login", json({ email: "setpw@iedora.com", password: PASSWORD }))).status).toBe(401);
  const login = await h.app.request("/auth/login", json({ email: "setpw@iedora.com", password: TEMP }));
  expect(login.status).toBe(200);
  const b = (await login.json()) as { accessToken: string };
  expect((claims(b.accessToken) as { mcp?: boolean }).mcp).toBe(true);
});

test("kick a device: 200 for a live family, 404 for a bogus one", async () => {
  const { access } = await registerUser(h, "kick@iedora.com");
  const sid = (claims(access) as { sid?: string }).sid ?? "";
  expect((await svcPost(`/auth/admin/users/${uid(access)}/sessions/${sid}/revoke`)).status).toBe(200);
  expect(
    (await svcPost(`/auth/admin/users/${uid(access)}/sessions/00000000-0000-0000-0000-000000000000/revoke`)).status,
  ).toBe(404);
});
