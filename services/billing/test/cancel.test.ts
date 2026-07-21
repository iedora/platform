import { expect, test } from "vitest";

import { TENANT, listSubscriptions, post, subscribe, useHarness } from "./harness.ts";

const h = useHarness();

test("cancel ends the subscription; a second cancel is 404", async () => {
  await subscribe(h, TENANT, "menu_pro");

  const ok = await h.app.request("/billing/cancel", post(h, { tenantId: TENANT, product: "menu" }));
  expect(ok.status).toBe(200);

  const { subscriptions } = await listSubscriptions(h, TENANT);
  expect(subscriptions[0]!.status).toBe("canceled");

  const again = await h.app.request("/billing/cancel", post(h, { tenantId: TENANT, product: "menu" }));
  expect(again.status).toBe(404);
});
