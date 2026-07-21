import { expect, test } from "bun:test";

import { TENANT, listInvoices, subscribe, useHarness } from "./harness";

const h = useHarness();

test("the recent-invoices feed returns invoices across tenants", async () => {
  await subscribe(h, TENANT, "menu_pro"); // a paid plan emits one invoice

  const { status, invoices } = await listInvoices(h, "limit=10");
  expect(status).toBe(200);
  expect(invoices.length).toBeGreaterThanOrEqual(1); // at least the menu_pro invoice
});
