import { expect, test } from "bun:test";

import { bearer, claims, registerUser, useHarness, withRefresh } from "./harness";

const h = useHarness();

test("create a tenant, then refresh picks up the org; whoami reflects identity", async () => {
  const { access, cookie } = await registerUser(h, "tenant@iedora.com");

  // whoami before any tenant — no active org yet
  const who = await h.app.request("/auth/whoami", bearer(access));
  expect(who.status).toBe(200);
  expect(((await who.json()) as { org?: string | null }).org).toBeFalsy();

  // create a tenant (caller becomes owner)
  const created = await h.app.request("/auth/tenants", {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "Acme" }),
  });
  expect(created.status).toBe(200);
  expect(((await created.json()) as { name: string }).name).toBe("Acme");

  // refresh now mints an org-scoped token (the onboarding flow) — the org rides
  // the access token's `org` claim (the TokenBundle body has no tenant field).
  const refreshed = await h.app.request("/auth/refresh", withRefresh(cookie!));
  expect(refreshed.status).toBe(200);
  const rb = (await refreshed.json()) as { accessToken: string };
  expect((claims(rb.accessToken) as { org?: string }).org).toBeTruthy();
});
