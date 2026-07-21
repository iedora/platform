import { expect, test } from "bun:test";

import { TENANT, listInvoices, outboxCount, post, subscribe, useHarness } from "./harness.ts";

const h = useHarness();

test("rejects requests without a service token", async () => {
  expect((await h.app.request("/billing/subscriptions?tenant=" + TENANT)).status).toBe(401);
  expect((await h.app.request("/billing/subscribe", { method: "POST", body: "{}" })).status).toBe(401);
});

test("subscribe to a paid plan creates a subscription + an invoice + an audit event", async () => {
  const before = await outboxCount(h);
  const sub = await subscribe(h, TENANT, "menu_pro");
  expect(sub.status).toBe(200);
  expect(sub.product).toBe("menu");
  expect(sub.planCode).toBe("menu_pro");
  expect(sub.subStatus).toBe("active");

  const { invoices } = await listInvoices(h, "tenant=" + TENANT);
  expect(invoices.length).toBe(1);
  expect(invoices[0]!.amountCents).toBe(1200); // Kasa = €12/year
  expect(invoices[0]!.planCode).toBe("menu_pro");

  // The audit event committed in the same tx → exactly one new outbox row.
  expect(await outboxCount(h)).toBe(before + 1);
});

test("subscribing to a free plan upserts the subscription but issues no invoice", async () => {
  const tenant = "22222222-2222-2222-2222-222222222222";
  const sub = await subscribe(h, tenant, "menu_free");
  expect(sub.status).toBe(200);
  expect(sub.planCode).toBe("menu_free");

  const { invoices } = await listInvoices(h, "tenant=" + tenant);
  expect(invoices.length).toBe(0);
});

test("an unknown plan is rejected (400)", async () => {
  const res = await h.app.request("/billing/subscribe", post(h, { tenantId: TENANT, planCode: "nope" }));
  expect(res.status).toBe(400);
});
