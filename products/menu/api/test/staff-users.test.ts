import { beforeAll, expect, test } from "bun:test";

import type { AdminUser, AdminUserDetail, AdminUserSession, AuditRecord } from "@iedora/contracts";
import { bearer, mintUserToken, staffToken, useHarness } from "./harness.ts";

// Staff "Users" CRM slice: the read-only BFF fan-out the menu service does for
// the admin user-management surface. The auth + audit services are faked via
// the harness stubs (userStub / auditStub) — this slice owns the gating, the
// aggregation shape, and the 404 path.
const h = useHarness("menu_staff_users");

const UID = "11111111-2222-3333-4444-555555555555";

const USER: AdminUser = {
  id: UID,
  email: "owner@example.com",
  name: "Olivia Owner",
  role: null,
  banned: false,
  banReason: null,
  banExpiresAt: null,
  emailVerifiedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  tenantCount: 2,
};

beforeAll(() => {
  h.userStub.list = [USER];
  h.userStub.detail = { ...USER, memberships: [{ tenantId: "t1", role: "owner" }] } satisfies AdminUserDetail;
  h.userStub.sessions = [
    {
      id: "s1",
      familyId: "f1",
      tenantId: "t1",
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      issuedAt: "2026-06-01T10:00:00.000Z",
      expiresAt: "2026-06-08T10:00:00.000Z",
      absoluteExpiresAt: "2026-06-30T10:00:00.000Z",
      revokedAt: null,
      current: true,
    } satisfies AdminUserSession,
  ];
  h.auditStub.events = [
    {
      id: "e1",
      at: "2026-06-01T10:00:00.000Z",
      source: "auth",
      action: "auth.session.login",
      outcome: "failure",
      actorType: "user",
      actorId: UID,
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      meta: { reason: "bad_password" },
    } satisfies AuditRecord,
  ];
});

test("the Users surface is role-gated (a plain user token is 403)", async () => {
  const user = await mintUserToken(h, { roles: [] });
  expect((await h.app.request("/api/staff/users", { headers: bearer(user) })).status).toBe(403);
});

test("GET /users lists users for staff", async () => {
  const res = await h.app.request("/api/staff/users", { headers: bearer(await staffToken(h)) });
  expect(res.status).toBe(200);
  const { users } = (await res.json()) as { users: AdminUser[] };
  expect(users).toHaveLength(1);
  expect(users[0]!.email).toBe("owner@example.com");
});

test("GET /users/:id aggregates profile + sessions (carrying the real IP)", async () => {
  const res = await h.app.request(`/api/staff/users/${UID}`, { headers: bearer(await staffToken(h)) });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: AdminUserDetail; sessions: AdminUserSession[] };
  expect(body.user.memberships).toHaveLength(1);
  expect(body.sessions[0]!.ip).toBe("203.0.113.7");
});

test("GET /users/:id/audit returns the actor's activity timeline (incl. failed login)", async () => {
  const res = await h.app.request(`/api/staff/users/${UID}/audit`, { headers: bearer(await staffToken(h)) });
  expect(res.status).toBe(200);
  const { events } = (await res.json()) as { events: AuditRecord[] };
  expect(events[0]!.action).toBe("auth.session.login");
  expect(events[0]!.outcome).toBe("failure");
  expect(events[0]!.ip).toBe("203.0.113.7");
});

test("GET /users/:id/login-attempts returns the user's sign-in events", async () => {
  const res = await h.app.request(`/api/staff/users/${UID}/login-attempts`, { headers: bearer(await staffToken(h)) });
  expect(res.status).toBe(200);
  const { events } = (await res.json()) as { events: { action: string }[] };
  expect(events[0]!.action).toBe("auth.session.login");
});

test("account actions are reachable for staff (force change, set password, kick)", async () => {
  const s = await staffToken(h);
  const post = (path: string, body?: unknown) =>
    h.app.request(path, {
      method: "POST",
      headers: { authorization: `Bearer ${s}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  expect((await post(`/api/staff/users/${UID}/force-password-change`)).status).toBe(200);
  expect((await post(`/api/staff/users/${UID}/set-password`, { password: "a-temporary-password-1" })).status).toBe(200);
  expect((await post(`/api/staff/users/${UID}/sessions/fam1/revoke`)).status).toBe(200);
});

test("account actions are role-gated (a plain user token is 403)", async () => {
  const user = await mintUserToken(h, { roles: [] });
  const res = await h.app.request(`/api/staff/users/${UID}/force-password-change`, {
    method: "POST",
    headers: { authorization: `Bearer ${user}` },
  });
  expect(res.status).toBe(403);
});

test("GET /users/:id 404s for an unknown user", async () => {
  h.userStub.detail = null;
  const res = await h.app.request(`/api/staff/users/${UID}`, { headers: bearer(await staffToken(h)) });
  expect(res.status).toBe(404);
});
