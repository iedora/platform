import { expect, test } from "bun:test";

import { TENANT, bearer, listSubscriptions, subscribe, useHarness } from "./harness.ts";

const h = useHarness();

test("re-subscribing upserts in place (one row per tenant+product)", async () => {
  await subscribe(h, TENANT, "menu_pro");
  expect((await subscribe(h, TENANT, "menu_agency")).status).toBe(200);

  const { subscriptions } = await listSubscriptions(h, TENANT);
  expect(subscriptions.length).toBe(1); // upserted, not duplicated
  expect(subscriptions[0]!.planCode).toBe("menu_agency");
  expect(subscriptions[0]!.status).toBe("active");
});

test("listing subscriptions without a tenant is a 400", async () => {
  expect((await h.app.request("/billing/subscriptions", { headers: bearer(h) })).status).toBe(400);
});
