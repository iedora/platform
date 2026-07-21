import { expect, test } from "bun:test";
import { sql } from "kysely";

import { OTHER_TENANT, TENANT, auth, json, jsonPatch, jsonPut, mintUserToken, useHarness } from "./harness";

// Dashboard slice: the tenant-scoped /api surface (restaurants, plan gate, tree,
// builder edits, reorder, tenancy). Tests run in order against one scratch DB.
const h = useHarness("menu_dash");

let slug = "";

test("rejects a request without a token (401) and a tenant-less token (403)", async () => {
  expect((await h.app.request("/api/restaurants")).status).toBe(401);
  const noTenant = await mintUserToken(h, { tenant: null });
  expect((await h.app.request("/api/restaurants", { headers: await auth(h, noTenant) })).status).toBe(403);
});

test("create a restaurant (slug derived) + it's listed with counts", async () => {
  const res = await h.app.request("/api/restaurants", await json(h, { name: "Tasca do Zé", defaultLanguage: "pt" }));
  expect(res.status).toBe(200);
  const r = (await res.json()) as { slug: string; defaultLanguage: string };
  expect(r.slug).toBe("tasca-do-ze");
  expect(r.defaultLanguage).toBe("pt");
  slug = r.slug;

  const list = await h.app.request("/api/restaurants", { headers: await auth(h) });
  const body = (await list.json()) as { restaurants: { slug: string; menuCount: number }[] };
  expect(body.restaurants.length).toBe(1);
  expect(body.restaurants[0]!.slug).toBe("tasca-do-ze");

  // the create emitted an audit event into the outbox
  const n = await sql<{ n: string }>`SELECT count(*)::text AS n FROM outbox_message`.execute(h.db.root);
  expect(Number(n.rows[0]!.n)).toBe(1);
});

test("a duplicate name gets a numbered slug, not an error (ON CONFLICT retry)", async () => {
  const res = await h.app.request("/api/restaurants", await json(h, { name: "Tasca do Zé", defaultLanguage: "pt" }));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { slug: string }).slug).toBe("tasca-do-ze-2");
});

test("the plan gate blocks creating past the limit", async () => {
  h.planStub.code = "menu_free"; // restaurants: 1, already at 1
  const res = await h.app.request("/api/restaurants", await json(h, { name: "Second" }));
  expect(res.status).toBe(422);
  h.planStub.code = "menu_pro";
});

test("GET /api/plan returns the effective entitlements", async () => {
  const res = await h.app.request("/api/plan", { headers: await auth(h) });
  expect(((await res.json()) as { code: string; restaurants: number }).restaurants).toBe(3);
});

test("builder: create menu → category → item, then the tree reflects them", async () => {
  const m = await h.app.request(`/api/restaurants/${slug}/menus`, await json(h, { name: "Almoço" }));
  const menuId = ((await m.json()) as { id: string }).id;
  const cat = await h.app.request(`/api/restaurants/${slug}/menus/${menuId}/categories`, await json(h, { name: "Pratos" }));
  const catId = ((await cat.json()) as { id: string }).id;
  const it = await h.app.request(
    `/api/restaurants/${slug}/categories/${catId}/items`,
    await json(h, { name: "Bacalhau", priceCents: 1200, nameI18n: { en: "Cod" } }),
  );
  expect(it.status).toBe(200);

  const tree = await h.app.request(`/api/restaurants/${slug}/tree`, { headers: await auth(h) });
  const body = (await tree.json()) as {
    defaultLanguage: string;
    menus: { name: string; categories: { name: string; items: { name: string; nameI18n: unknown }[] }[] }[];
  };
  expect(body.defaultLanguage).toBe("pt");
  expect(body.menus[0]!.name).toBe("Almoço");
  expect(body.menus[0]!.categories[0]!.items[0]!.name).toBe("Bacalhau");
  expect(body.menus[0]!.categories[0]!.items[0]!.nameI18n).toEqual({ en: "Cod" });
});

test("seed creates the sample menu", async () => {
  const res = await h.app.request(`/api/restaurants/${slug}/seed`, await json(h, {}));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { menuId: string }).menuId).toBeTruthy();
});

test("changing the default language rotates content (promote)", async () => {
  // promote pt → en: the pt plain value demotes into i18n.pt, en override promotes to plain
  const res = await h.app.request(
    `/api/restaurants/${slug}`,
    await jsonPatch(h, { defaultLanguage: "en", supportedLanguages: ["en", "pt"] }),
  );
  expect(res.status).toBe(200);
  const tree = await h.app.request(`/api/restaurants/${slug}/tree`, { headers: await auth(h) });
  const body = (await tree.json()) as {
    defaultLanguage: string;
    menus: { categories: { items: { name: string; nameI18n: Record<string, string> }[] }[] }[];
  };
  expect(body.defaultLanguage).toBe("en");
  const item = body.menus.flatMap((m) => m.categories).flatMap((c) => c.items).find((i) => i.name === "Cod");
  expect(item).toBeTruthy(); // the en override is now the plain value
  expect(item!.nameI18n.pt).toBe("Bacalhau"); // the old default demoted into the i18n map
});

test("reorder rejects a list that does not name every child exactly once (422)", async () => {
  const tree = await h.app.request(`/api/restaurants/${slug}/tree`, { headers: await auth(h) });
  const menuId = ((await tree.json()) as { menus: { id: string }[] }).menus[0]!.id;
  const res = await h.app.request(
    `/api/restaurants/${slug}/menus/${menuId}/category-order`,
    await jsonPut(h, { orderedIds: ["aaaaaaaa-0000-0000-0000-000000000000"] }),
  );
  expect(res.status).toBe(422);
});

test("tenancy: another tenant's token cannot see the restaurant (404), unknown slug 404", async () => {
  const other = await mintUserToken(h, { tenant: OTHER_TENANT });
  expect((await h.app.request(`/api/restaurants/${slug}/tree`, { headers: await auth(h, other) })).status).toBe(404);
  expect((await h.app.request(`/api/restaurants/nope/tree`, { headers: await auth(h) })).status).toBe(404);
});

test("staff token reaches a foreign tenant's restaurant (cross-tenant scope)", async () => {
  const staff = await mintUserToken(h, { tenant: OTHER_TENANT, roles: ["iedora-admin"] });
  const res = await h.app.request(`/api/restaurants/${slug}`, { headers: await auth(h, staff) });
  expect(res.status).toBe(200);
});

test("analytics ranks top dishes by views + averages session dwell over the range", async () => {
  const k = h.db.root;
  const rid = (await sql<{ id: string }>`SELECT id FROM restaurants WHERE slug=${slug}`.execute(k)).rows[0]!.id;
  const [a, b] = (await sql<{ id: string }>`SELECT id FROM items WHERE restaurant_id=${rid} ORDER BY created_at LIMIT 2`.execute(k)).rows;
  const day = new Date().toISOString().slice(0, 10);
  // dish `a` out-views dish `b`; two sessions average to 90s.
  await sql`INSERT INTO item_view (restaurant_id, tenant_id, item_id, day, count) VALUES
            (${rid}, ${TENANT}, ${a!.id}, ${day}, 5), (${rid}, ${TENANT}, ${b!.id}, ${day}, 2)`.execute(k);
  await sql`INSERT INTO menu_session (restaurant_id, tenant_id, day, duration_seconds) VALUES
            (${rid}, ${TENANT}, ${day}, 60), (${rid}, ${TENANT}, ${day}, 120)`.execute(k);

  const res = await h.app.request("/api/analytics?range=30d", { headers: await auth(h) });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    topDishes: { itemId: string; viewCount: number }[];
    avgSessionSeconds: number;
  };
  expect(body.topDishes[0]).toMatchObject({ itemId: a!.id, viewCount: 5 });
  expect(body.topDishes[1]!.viewCount).toBe(2);
  expect(body.avgSessionSeconds).toBe(90);
});
