import { beforeAll, expect, test } from "bun:test";
import { sql } from "kysely";

import { TENANT, bearer, json, mintUserToken, seedRestaurant, staffToken, useHarness } from "./harness";

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

  const detail = await h.app.request(`/api/staff/directory/${RID}`, { headers: bearer(s) });
  const d = (await detail.json()) as { restaurant: { slug: string }; trend: unknown[] };
  expect(d.restaurant.slug).toBe("tasca");
  expect(d.trend.length).toBe(14); // 13 days back + today
});

test("staff alerts flag the empty-menu restaurant has items (so not flagged) + unbound count", async () => {
  const res = await h.app.request("/api/staff/alerts", { headers: bearer(await staffToken(h)) });
  const a = (await res.json()) as { emptyMenus: unknown[]; unboundQr: number };
  expect(a.emptyMenus.length).toBe(0); // our seed restaurant has an item
  expect(a.unboundQr).toBe(2); // 3 created, 1 bound
});
