import { expect, test } from "vitest"
import { sql } from "kysely"

import { expireDueSubscriptions } from "../src/features/expiry/expire.service.ts"
import { bearer, post, useHarness } from "./harness.ts"

const h = useHarness()

// The billing lifecycle end to end, in-process: a payment upgrades the tenant,
// the upgrade reads back, and every step lands on the audit outbox — plus the
// scheduled expiry sweep downgrades and audits in turn. (The menu↔billing HTTP
// handshake is menu's concern; here we exercise billing's own transaction +
// outbox.) A unique tenant per call keeps tests from colliding on the shared DB.
let seq = 0
const freshTenant = () => `aaaaaaaa-0000-4000-8000-${String((seq += 1)).padStart(12, "0")}`

/** The queued audit envelopes for one tenant, newest first. */
async function auditEvents(
  tenantId: string,
): Promise<{ action: string; actorType: string; meta: Record<string, unknown> }[]> {
  const r = await sql<{ payload: string }>`
    SELECT payload::text AS payload FROM outbox_message ORDER BY created_at DESC, id DESC
  `.execute(h.db.root)
  return r.rows
    .map((row) => JSON.parse(row.payload) as { action: string; actorType: string; tenantId?: string | null; metadata: Record<string, unknown> })
    .filter((e) => (e.tenantId ?? undefined) === tenantId)
    .map((e) => ({ action: e.action, actorType: e.actorType, meta: e.metadata ?? {} }))
}

async function recordPayment(
  tenantId: string,
  amountCents: number,
  actorId?: string,
): Promise<{ status: number; body: { status?: string; amountCents?: number } }> {
  const res = await h.app.request(
    "/billing/invoices",
    post(h, { tenant: tenantId, planCode: "menu_pro", amountCents, currency: "EUR", ...(actorId ? { actorId } : {}) }),
  )
  const body = res.status === 201 ? ((await res.json()) as { invoice: { status: string; amountCents: number } }).invoice : {}
  return { status: res.status, body }
}

async function subscriptions(tenantId: string): Promise<{ planCode: string; status: string; currentPeriodEnd?: string }[]> {
  const res = await h.app.request(`/billing/subscriptions?tenant=${tenantId}`, { headers: bearer(h) })
  return ((await res.json()) as { subscriptions: { planCode: string; status: string; currentPeriodEnd?: string }[] }).subscriptions
}

test("recording a payment upgrades the tenant + audits it", async () => {
  const tenant = freshTenant()
  const { body } = await recordPayment(tenant, 1200, "staff-7")
  expect(body.status).toBe("paid")
  expect(body.amountCents).toBe(1200)

  const subs = await subscriptions(tenant)
  expect(subs).toHaveLength(1)
  expect(subs[0]!.planCode).toBe("menu_pro")
  expect(subs[0]!.status).toBe("active")
  const daysOut = (new Date(subs[0]!.currentPeriodEnd!).getTime() - Date.now()) / 864e5
  expect(daysOut).toBeGreaterThan(360)
  expect(daysOut).toBeLessThan(370)

  const events = await auditEvents(tenant)
  expect(events).toHaveLength(1)
  expect(events[0]!.action).toBe("billing.payment.recorded")
  expect(events[0]!.actorType).toBe("user")
  expect(events[0]!.meta.upgraded_to).toBe("menu_pro")
  expect(events[0]!.meta.amount_cents).toBe(1200)
})

test("a service-actor payment (no actorId) still upgrades + audits", async () => {
  const tenant = freshTenant()
  await recordPayment(tenant, 1000)
  const subs = await subscriptions(tenant)
  expect(subs[0]!.planCode).toBe("menu_pro")
  const events = await auditEvents(tenant)
  expect(events[0]!.action).toBe("billing.payment.recorded")
  expect(events[0]!.actorType).toBe("service")
})

test("a second payment extends the same subscription, not a duplicate", async () => {
  const tenant = freshTenant()
  await recordPayment(tenant, 1200)
  await recordPayment(tenant, 1200)
  expect(await subscriptions(tenant)).toHaveLength(1) // upsert, not insert
})

test("the expiry sweep downgrades a past-due tenant to On Us + audits it", async () => {
  const tenant = freshTenant()
  await sql`
    INSERT INTO subscriptions (tenant_id, product, plan_code, status, current_period_end)
    VALUES (${tenant}, 'menu', 'menu_pro', 'active', now() - interval '2 days')
  `.execute(h.db.root)

  // A real outbox-backed auditor so the sweep's audit lands where we assert.
  const { OutboxWriter } = await import("../src/outbox.ts")
  const expired = await expireDueSubscriptions(h.db, new OutboxWriter(h.db, "billing"))
  expect(expired).toBe(1)

  const subs = await subscriptions(tenant)
  expect(subs.every((s) => s.status !== "active")).toBe(true)

  const events = await auditEvents(tenant)
  expect(events).toHaveLength(1)
  expect(events[0]!.action).toBe("billing.subscription.expired")
  expect(events[0]!.actorType).toBe("system")
  expect(events[0]!.meta.downgraded_to).toBe("on_us")

  // Idempotent: a second sweep finds nothing more for this tenant.
  await expireDueSubscriptions(h.db, new OutboxWriter(h.db, "billing"))
  expect(await auditEvents(tenant)).toHaveLength(1)
})

test("one sweep expires every past-due tenant + audits each", async () => {
  const { OutboxWriter } = await import("../src/outbox.ts")
  const tenants = [freshTenant(), freshTenant(), freshTenant()]
  for (const t of tenants) {
    await sql`
      INSERT INTO subscriptions (tenant_id, product, plan_code, status, current_period_end)
      VALUES (${t}, 'menu', 'menu_pro', 'active', now() - interval '1 day')
    `.execute(h.db.root)
  }
  const current = freshTenant()
  await recordPayment(current, 1200)

  const n = await expireDueSubscriptions(h.db, new OutboxWriter(h.db, "billing"))
  expect(n).toBeGreaterThanOrEqual(tenants.length)

  for (const t of tenants) {
    const events = await auditEvents(t)
    expect(events.some((e) => e.action === "billing.subscription.expired")).toBe(true)
  }
  expect((await subscriptions(current))[0]!.status).toBe("active")
})
