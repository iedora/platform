import { expect, test } from "bun:test";

import { bearer, registerUser, useHarness, withCookie } from "./harness";

const h = useHarness();

test("create a tenant, then refresh picks up the tid; whoami reflects identity", async () => {
  const { access, cookie } = await registerUser(h, "tenant@iedora.com");

  // whoami before any tenant
  const who = await h.app.request("/auth/whoami", bearer(access));
  expect(who.status).toBe(200);
  expect(((await who.json()) as { tenantId?: string }).tenantId).toBeUndefined();

  // create a tenant (caller becomes owner)
  const created = await h.app.request("/auth/tenants", {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "Acme" }),
  });
  expect(created.status).toBe(200);
  expect(((await created.json()) as { name: string }).name).toBe("Acme");

  // refresh now mints a tenant-scoped token (the onboarding flow)
  const refreshed = await h.app.request("/auth/refresh", withCookie(cookie!));
  expect(refreshed.status).toBe(200);
  expect(((await refreshed.json()) as { tenantId?: string }).tenantId).toBeTruthy();
});
