import { beforeAll, expect, test } from "bun:test";
import { sql } from "kysely";

import { TENANT, bearer, json, jsonPatch, mintUserToken, seedRestaurant, staffToken, useHarness } from "./harness";

// Staff slice: the cross-tenant /api/staff surface (role-gated overview, QR
// admin, directory, alerts). Seeds one restaurant tree per file.
const h = useHarness("menu_staff");

const RID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeAll(async () => {
  await seedRestaurant(h, { id: RID, tenant: TENANT, slug: "tasca", defaultLanguage: "en", supportedLanguages: ["en"] });
  const k = h.db.root;
  await sql`INSERT INTO menus (id, restaurant_id, name, active) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', ${RID}, 'M', true)`.execute(k);
  await sql`INSERT INTO categories (id, menu_id, restaurant_id, name) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd','cccccccc-cccc-cccc-cccc-cccccccccccc', ${RID}, 'C')`.execute(k);
  await sql`INSERT INTO items (category_id, restaurant_id, name, price_cents) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', ${RID}, 'Dish', 500)`.execute(k);
});

test("the staff surface is role-gated (a plain user token is 403)", async () => {
  const user = await mintUserToken(h, { roles: [] });
  expect((await h.app.request("/api/staff/overview", { headers: bearer(user) })).status).toBe(403);
});

test("staff overview returns the platform snapshot", async () => {
  const res = await h.app.request("/api/staff/overview", { headers: bearer(await staffToken(h)) });
  expect(res.status).toBe(200);
  const o = (await res.json()) as { restaurants: number; items: number; topByViews: unknown[] };
  expect(o.restaurants).toBe(1);
  expect(o.items).toBe(1);
  expect(Array.isArray(o.topByViews)).toBe(true);
});

test("QR admin: bulk create, list, bind, then it resolves publicly", async () => {
  const s = await staffToken(h);
  const created = await h.app.request("/api/staff/qr-codes", await json(h, { count: 3 }, s));
  expect(((await created.json()) as { inserted: number }).inserted).toBe(3);

  const list = await h.app.request("/api/staff/qr-codes", { headers: bearer(s) });
  const codes = ((await list.json()) as { codes: { code: string; boundAt?: string }[] }).codes;
  expect(codes.length).toBe(3);

  const code = codes[0]!.code;
  const bind = await h.app.request(`/api/staff/qr-codes/${code}/bind`, await json(h, { restaurantId: RID }, s));
  expect(bind.status).toBe(200);

  // public scan resolution now finds the bound restaurant
  const resolved = await h.app.request(`/public/qr/${code}`);
  expect(((await resolved.json()) as { slug: string }).slug).toBe("tasca");
});

test("staff directory search + drill-in", async () => {
  const s = await staffToken(h);
  const dir = await h.app.request("/api/staff/directory?q=tas", { headers: bearer(s) });
  const rows = ((await dir.json()) as { restaurants: { id: string; items: number }[] }).restaurants;
  expect(rows.length).toBe(1);
  expect(rows[0]!.items).toBe(1);

  const detail = await h.app.request(`/api/staff/restaurants/${RID}`, { headers: bearer(s) });
  const d = (await detail.json()) as { restaurant: { slug: string }; trend: unknown[] };
  expect(d.restaurant.slug).toBe("tasca");
  expect(d.trend.length).toBe(14); // 13 days back + today
});

test("staff restaurant detail aggregates the record + billing + audit trail", async () => {
  const s = await staffToken(h);
  h.billingStub.subscriptions = [
    { id: "s1", tenantId: TENANT, product: "menu", planCode: "menu_pro", status: "active", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  ];
  h.billingStub.invoices = [
    { id: "i1", tenantId: TENANT, product: "menu", planCode: "menu_pro", amountCents: 1200, currency: "EUR", status: "paid", createdAt: "2026-01-01T00:00:00Z" },
  ];
  h.auditStub.events = [
    { id: "e1", at: "2026-01-01T00:00:00Z", source: "menu", action: "menu.restaurant.created", outcome: "success", actorType: "user", targetId: RID, meta: {} },
  ];
  h.tenantStub.value = {
    id: TENANT,
    name: "Tasca Group",
    slug: "tasca-group",
    owner: { id: "u1", email: "owner@tasca.test", name: "Ana Owner" },
  };

  const res = await h.app.request(`/api/staff/restaurants/${RID}`, { headers: bearer(s) });
  expect(res.status).toBe(200);
  const d = (await res.json()) as {
    restaurant: { slug: string };
    trend: unknown[];
    billing: { subscriptions: { planCode: string }[]; invoices: { amountCents: number }[] };
    audit: { action: string }[];
    tenant: { name: string; owner: { email: string } } | null;
  };
  expect(d.restaurant.slug).toBe("tasca");
  expect(d.trend.length).toBe(14);
  expect(d.billing.subscriptions[0]!.planCode).toBe("menu_pro");
  expect(d.billing.invoices[0]!.amountCents).toBe(1200);
  expect(d.audit[0]!.action).toBe("menu.restaurant.created");
  expect(d.tenant!.name).toBe("Tasca Group");
  expect(d.tenant!.owner.email).toBe("owner@tasca.test");
});

test("staff restaurant detail still 200s when a cross-service read throws", async () => {
  const s = await staffToken(h);
  h.tenantStub.fail = true; // auth read throws → best-effort degrades to null, page renders
  try {
    const res = await h.app.request(`/api/staff/restaurants/${RID}`, { headers: bearer(s) });
    expect(res.status).toBe(200);
    const d = (await res.json()) as { restaurant: { slug: string }; tenant: unknown };
    expect(d.restaurant.slug).toBe("tasca"); // core record still served
    expect(d.tenant).toBeNull(); // failed read degraded, not 500
  } finally {
    h.tenantStub.fail = false;
  }
});

test("staff restaurant detail 404s for an unknown id", async () => {
  const res = await h.app.request(
    "/api/staff/restaurants/99999999-9999-9999-9999-999999999999",
    { headers: bearer(await staffToken(h)) },
  );
  expect(res.status).toBe(404);
});

test("staff can override the friendly name (identity override) and it persists", async () => {
  const s = await staffToken(h);
  const res = await h.app.request(`/api/staff/restaurants/${RID}`, await jsonPatch(h, { name: "Tasca Renamed" }, s));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { restaurant: { name: string } }).restaurant.name).toBe("Tasca Renamed");

  // The change persists — the aggregated detail reflects it.
  const after = await h.app.request(`/api/staff/restaurants/${RID}`, { headers: bearer(s) });
  expect(((await after.json()) as { restaurant: { name: string } }).restaurant.name).toBe("Tasca Renamed");
});

test("staff rename rejects an empty name (422) and 404s for an unknown id", async () => {
  const s = await staffToken(h);
  const empty = await h.app.request(`/api/staff/restaurants/${RID}`, await jsonPatch(h, { name: "  " }, s));
  expect(empty.status).toBe(422);

  const missing = await h.app.request(
    "/api/staff/restaurants/99999999-9999-9999-9999-999999999999",
    await jsonPatch(h, { name: "X" }, s),
  );
  expect(missing.status).toBe(404);
});

test("staff rename is role-gated (a plain user token is 403)", async () => {
  const user = await mintUserToken(h, { roles: [] });
  const res = await h.app.request(`/api/staff/restaurants/${RID}`, await jsonPatch(h, { name: "Nope" }, user));
  expect(res.status).toBe(403);
});

test("staff alerts flag the empty-menu restaurant has items (so not flagged) + unbound count", async () => {
  const res = await h.app.request("/api/staff/alerts", { headers: bearer(await staffToken(h)) });
  const a = (await res.json()) as { emptyMenus: unknown[]; unboundQr: number };
  expect(a.emptyMenus.length).toBe(0); // our seed restaurant has an item
  expect(a.unboundQr).toBe(2); // 3 created, 1 bound
});
