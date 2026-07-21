import { beforeAll, expect, test } from "bun:test";
import { sql } from "kysely";

import { auth, json, jsonPatch, jsonPut, seedRestaurant, useHarness } from "./harness.ts";

// Builder slice: the menu-tree mutations the broad dashboard flow doesn't reach
// — item updates with variants, item reordering, and deletes (with cascade).
const h = useHarness("menu_builder");

const RID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
let menuId = "";
let catId = "";
let itemA = "";
let itemB = "";

const idOf = async (res: Response) => ((await res.json()) as { id: string }).id;

/** The category's items, in order, flattened from the tree. */
async function items(): Promise<{ id: string; name: string; variants: unknown[] }[]> {
  const body = (await (await h.app.request("/api/restaurants/builder/tree", { headers: await auth(h) })).json()) as {
    menus: { categories: { items: { id: string; name: string; variants: unknown[] }[] }[] }[];
  };
  return body.menus.flatMap((m) => m.categories).flatMap((c) => c.items);
}

beforeAll(async () => {
  await seedRestaurant(h, { id: RID, slug: "builder", defaultLanguage: "en" });
  menuId = await idOf(await h.app.request("/api/restaurants/builder/menus", await json(h, { name: "Lunch" })));
  catId = await idOf(await h.app.request(`/api/restaurants/builder/menus/${menuId}/categories`, await json(h, { name: "Mains" })));
  itemA = await idOf(await h.app.request(`/api/restaurants/builder/categories/${catId}/items`, await json(h, { name: "A", priceCents: 100 })));
  itemB = await idOf(await h.app.request(`/api/restaurants/builder/categories/${catId}/items`, await json(h, { name: "B", priceCents: 200 })));
});

test("PATCH an item: rename, reprice, attach variants", async () => {
  const res = await h.app.request(
    `/api/restaurants/builder/items/${itemA}`,
    await jsonPatch(h, { name: "Steak", priceCents: 1900, variants: [{ label: "Half", priceCents: 1100 }] }),
  );
  expect(res.status).toBe(200);
  const a = (await items()).find((i) => i.id === itemA)!;
  expect(a.name).toBe("Steak");
  expect(a.variants).toHaveLength(1);
});

test("PUT item-order reorders within the category", async () => {
  const res = await h.app.request(`/api/restaurants/builder/categories/${catId}/item-order`, await jsonPut(h, { orderedIds: [itemB, itemA] }));
  expect(res.status).toBe(200);
  expect((await items()).map((i) => i.id)).toEqual([itemB, itemA]);
});

test("item-order rejects a list that doesn't name every item exactly once (422)", async () => {
  const res = await h.app.request(`/api/restaurants/builder/categories/${catId}/item-order`, await jsonPut(h, { orderedIds: [itemA] }));
  expect(res.status).toBe(422);
});

test("DELETE an item removes it from the tree", async () => {
  const res = await h.app.request(`/api/restaurants/builder/items/${itemB}`, { method: "DELETE", headers: await auth(h) });
  expect(res.status).toBe(200);
  expect((await items()).some((i) => i.id === itemB)).toBe(false);
});

test("a new dish inherits the restaurant's default currency", async () => {
  // Move the restaurant default to USD via the identity patch.
  const patch = await h.app.request("/api/restaurants/builder", await jsonPatch(h, { defaultCurrency: "USD" }));
  expect(patch.status).toBe(200);
  // A dish created without an explicit currency picks up the new default
  // (the old hard-coded EUR fallback would have made this fail).
  const id = await idOf(
    await h.app.request(
      `/api/restaurants/builder/categories/${catId}/items`,
      await json(h, { name: "Inherited", priceCents: 300 }),
    ),
  );
  const row = await sql<{ currency: string }>`SELECT currency FROM items WHERE id=${id}`.execute(h.db.root);
  expect(row.rows[0]!.currency).toBe("USD");
});

test("DELETE a category cascades to its remaining items", async () => {
  const res = await h.app.request(`/api/restaurants/builder/categories/${catId}`, { method: "DELETE", headers: await auth(h) });
  expect(res.status).toBe(200);
  const n = await sql<{ n: string }>`SELECT count(*)::text AS n FROM items WHERE category_id=${catId}`.execute(h.db.root);
  expect(Number(n.rows[0]!.n)).toBe(0);
});
