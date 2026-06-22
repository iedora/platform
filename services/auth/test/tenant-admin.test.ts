import { expect, test } from "bun:test";

import { claims, createTenantWithOwner, registerUser, useHarness } from "./harness";

// Service-only tenant administration for the admin BFF: GET /auth/tenants/:id
// (a tenant + owner), GET /auth/admin/tenants (the picker list), and
// POST /auth/admin/tenants (provision a tenant for an owner).
const h = useHarness();

const svc = () => ({ authorization: `Bearer ${h.serviceToken}` });
const svcPost = (body: unknown) => ({
  method: "POST",
  headers: { ...svc(), "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("returns the tenant + its owner user with a service token", async () => {
  const { userId, tenantId, tenantName } = await createTenantWithOwner(h, "owner@iedora.com");

  const res = await h.app.request(`/auth/tenants/${tenantId}`, {
    headers: { authorization: `Bearer ${h.serviceToken}` },
  });
  expect(res.status).toBe(200);
  const t = (await res.json()) as {
    id: string;
    name: string;
    owner: { id: string; email: string; name: string | null };
  };
  expect(t.id).toBe(tenantId);
  expect(t.name).toBe(tenantName);
  expect(t.owner.id).toBe(userId);
  expect(t.owner.email).toBe("owner@iedora.com");
});

test("rejects a request without a service token (401)", async () => {
  const { tenantId } = await createTenantWithOwner(h, "owner2@iedora.com");
  expect((await h.app.request(`/auth/tenants/${tenantId}`)).status).toBe(401);
});

test("404s for an unknown tenant", async () => {
  const res = await h.app.request("/auth/tenants/00000000-0000-0000-0000-000000000000", {
    headers: { authorization: `Bearer ${h.serviceToken}` },
  });
  expect(res.status).toBe(404);
});

// ── GET /auth/admin/tenants (picker list) ────────────────────────────────────
test("lists tenants with their owners for the picker", async () => {
  const { tenantId, tenantName } = await createTenantWithOwner(h, "list@iedora.com");
  const res = await h.app.request("/auth/admin/tenants", { headers: svc() });
  expect(res.status).toBe(200);
  const { tenants } = (await res.json()) as { tenants: { id: string; name: string; owner: { email: string } }[] };
  const row = tenants.find((t) => t.id === tenantId);
  expect(row?.name).toBe(tenantName);
  expect(row?.owner.email).toBe("list@iedora.com");
});

test("the picker list rejects a request without a service token (401)", async () => {
  expect((await h.app.request("/auth/admin/tenants")).status).toBe(401);
});

// ── POST /auth/admin/tenants (provision for an owner) ────────────────────────
test("provisions a tenant owned by an existing user", async () => {
  const { access } = await registerUser(h, "newowner@iedora.com");
  const ownerUserId = (claims(access) as { sub?: string }).sub ?? "";

  const res = await h.app.request("/auth/admin/tenants", svcPost({ name: "Provisioned Co", ownerUserId }));
  expect(res.status).toBe(200);
  const { id } = (await res.json()) as { id: string; name: string };

  // The new tenant resolves with the given user as its owner.
  const detail = await h.app.request(`/auth/tenants/${id}`, { headers: svc() });
  const t = (await detail.json()) as { name: string; owner: { id: string } };
  expect(t.name).toBe("Provisioned Co");
  expect(t.owner.id).toBe(ownerUserId);
});

test("provisioning 422s for an unknown owner user (no orphan tenant)", async () => {
  const res = await h.app.request(
    "/auth/admin/tenants",
    svcPost({ name: "Ghost Co", ownerUserId: "00000000-0000-0000-0000-000000000000" }),
  );
  expect(res.status).toBe(422);
});

test("provisioning rejects a blank name (400) and a missing service token (401)", async () => {
  const { access } = await registerUser(h, "blank@iedora.com");
  const ownerUserId = (claims(access) as { sub?: string }).sub ?? "";
  expect((await h.app.request("/auth/admin/tenants", svcPost({ name: "  ", ownerUserId }))).status).toBe(400);
  expect(
    (
      await h.app.request("/auth/admin/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "X", ownerUserId }),
      })
    ).status,
  ).toBe(401);
});
