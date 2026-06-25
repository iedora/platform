import { expireDueSubscriptions } from "@iedora/service-billing/expire";
import { expect, test } from "bun:test";
import { sql } from "kysely";

import { auditEvents, freshTenant, useIntegration } from "./harness";

const h = useIntegration();

// The whole point of this file: drive menu's real BillingClient against the
// real billing service and verify the lifecycle we built — payment upgrades the
// tenant, the upgrade is visible on read-back, and every step is audited — plus
// the scheduled expiry sweep downgrades and audits in turn.

test("recording a payment through the client upgrades the tenant + audits it", async () => {
  const tenant = freshTenant();

  const invoice = await h.billing.recordPayment({
    tenantId: tenant,
    planCode: "menu_pro",
    amountCents: 1200,
    currency: "EUR",
    actorId: "staff-7",
  });
  expect(invoice.status).toBe("paid");
  expect(invoice.amountCents).toBe(1200);

  // Read back through the client: the tenant is now on the paid plan, active,
  // with a period end ~a year out.
  const subs = await h.billing.subscriptions(tenant);
  expect(subs).toHaveLength(1);
  expect(subs[0]!.planCode).toBe("menu_pro");
  expect(subs[0]!.status).toBe("active");
  const periodEnd = new Date(subs[0]!.currentPeriodEnd!).getTime();
  const daysOut = (periodEnd - Date.now()) / 864e5;
  expect(daysOut).toBeGreaterThan(360);
  expect(daysOut).toBeLessThan(370);

  // The plan gate (the hot-path resolver) sees the upgrade too.
  expect(await h.billing.planCode(tenant)).toBe("menu_pro");

  // The invoice landed in the ledger.
  const invoices = await h.billing.invoices(tenant);
  expect(invoices).toHaveLength(1);

  // The payment was audited as a user-actor event carrying the upgrade.
  const events = (await auditEvents(h)).filter((e) => e.tenantId === tenant);
  expect(events).toHaveLength(1);
  expect(events[0]!.action).toBe("billing.payment.recorded");
  expect(events[0]!.actorType).toBe("user");
  expect(events[0]!.meta.upgraded_to).toBe("menu_pro");
  expect(events[0]!.meta.amount_cents).toBe(1200);
});

test("a service-actor payment (no actorId) still upgrades + audits", async () => {
  const tenant = freshTenant();
  await h.billing.recordPayment({
    tenantId: tenant,
    planCode: "menu_pro",
    amountCents: 1000,
    currency: "EUR",
  });

  expect(await h.billing.planCode(tenant)).toBe("menu_pro");
  const events = (await auditEvents(h)).filter((e) => e.tenantId === tenant);
  expect(events[0]!.action).toBe("billing.payment.recorded");
  expect(events[0]!.actorType).toBe("service");
});

test("a second payment extends the same subscription, not a duplicate", async () => {
  const tenant = freshTenant();
  await h.billing.recordPayment({ tenantId: tenant, planCode: "menu_pro", amountCents: 1200, currency: "EUR" });
  await h.billing.recordPayment({ tenantId: tenant, planCode: "menu_pro", amountCents: 1200, currency: "EUR" });

  const subs = await h.billing.subscriptions(tenant);
  expect(subs).toHaveLength(1); // upsert, not insert
  const invoices = await h.billing.invoices(tenant);
  expect(invoices).toHaveLength(2); // ledger is append-only
});

test("the expiry sweep downgrades a past-due tenant to On Us + audits it", async () => {
  const tenant = freshTenant();
  // Seed an active subscription whose period already ended.
  await sql`
    INSERT INTO subscriptions (tenant_id, product, plan_code, status, current_period_end)
    VALUES (${tenant}, 'menu', 'menu_pro', 'active', now() - interval '2 days')
  `.execute(h.billingDb.root);

  const expired = await expireDueSubscriptions(h.billingDb, h.billingAuditor());
  expect(expired).toBe(1);

  // The plan gate now resolves to unsubscribed (On Us) for this tenant.
  expect(await h.billing.planCode(tenant)).toBe("");

  const events = (await auditEvents(h)).filter((e) => e.tenantId === tenant);
  expect(events).toHaveLength(1);
  expect(events[0]!.action).toBe("billing.subscription.expired");
  expect(events[0]!.actorType).toBe("system");
  expect(events[0]!.meta.downgraded_to).toBe("on_us");

  // Idempotent: a second sweep finds nothing and emits no further events.
  expect(await expireDueSubscriptions(h.billingDb, h.billingAuditor())).toBe(0);
});

test("the sweep leaves in-period subscriptions untouched", async () => {
  const tenant = freshTenant();
  await h.billing.recordPayment({ tenantId: tenant, planCode: "menu_pro", amountCents: 1200, currency: "EUR" });

  await expireDueSubscriptions(h.billingDb, h.billingAuditor());

  expect(await h.billing.planCode(tenant)).toBe("menu_pro");
});

test("a never-subscribed tenant resolves to On Us (empty plan code)", async () => {
  expect(await h.billing.planCode(freshTenant())).toBe("");
});

test("one sweep expires every past-due tenant + audits each", async () => {
  const tenants = [freshTenant(), freshTenant(), freshTenant()];
  for (const t of tenants) {
    await sql`
      INSERT INTO subscriptions (tenant_id, product, plan_code, status, current_period_end)
      VALUES (${t}, 'menu', 'menu_pro', 'active', now() - interval '1 day')
    `.execute(h.billingDb.root);
  }
  // A still-current tenant in the same sweep stays active.
  const current = freshTenant();
  await h.billing.recordPayment({ tenantId: current, planCode: "menu_pro", amountCents: 1200, currency: "EUR" });

  expect(await expireDueSubscriptions(h.billingDb, h.billingAuditor())).toBe(tenants.length);

  for (const t of tenants) {
    expect(await h.billing.planCode(t)).toBe("");
    const events = (await auditEvents(h)).filter(
      (e) => e.tenantId === t && e.action === "billing.subscription.expired",
    );
    expect(events).toHaveLength(1);
  }
  expect(await h.billing.planCode(current)).toBe("menu_pro");
});

test("a paid-then-expired tenant can be re-upgraded by a new payment", async () => {
  const tenant = freshTenant();
  await sql`
    INSERT INTO subscriptions (tenant_id, product, plan_code, status, current_period_end)
    VALUES (${tenant}, 'menu', 'menu_pro', 'active', now() - interval '1 day')
  `.execute(h.billingDb.root);
  await expireDueSubscriptions(h.billingDb, h.billingAuditor());
  expect(await h.billing.planCode(tenant)).toBe("");

  // A fresh payment reactivates the subscription (upsert flips it back to active).
  await h.billing.recordPayment({ tenantId: tenant, planCode: "menu_pro", amountCents: 1200, currency: "EUR" });
  expect(await h.billing.planCode(tenant)).toBe("menu_pro");
  const subs = await h.billing.subscriptions(tenant);
  expect(subs).toHaveLength(1);
  expect(subs[0]!.status).toBe("active");
});
