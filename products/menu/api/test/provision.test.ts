import { beforeAll, beforeEach, expect, test } from "vitest";
import { sql } from "kysely";

import { TENANT, bearer, json, jsonPut, mintUserToken, staffToken, useHarness } from "./harness.ts";

// Staff provisioning: POST /api/staff/restaurants (manual) and
// /restaurants/import (JSON), plus GET /tenants. The interesting surface here is
// the RED path — bad payloads, bad tenants, over-budget imports — so most of
// this file pushes failure cases and asserts nothing leaks (no orphan tenant, no
// half-imported restaurant). Green paths come last to prove it still works.
const h = useHarness("menu_provision");

const NEW_TENANT = "99999999-9999-9999-9999-999999999999";

const ownerTenant = {
  id: TENANT,
  name: "Acme Group",
  slug: "acme-group",
  owner: { id: "u1", email: "owner@acme.test", name: "Ana Owner" },
};

beforeAll(() => {
  h.tenantStub.newTenantId = NEW_TENANT;
});

// Reset the tenant fake before each test so one test's red-path tweak
// (createError, value=null, …) never bleeds into the next.
beforeEach(() => {
  h.tenantStub.value = ownerTenant; // existing tenant resolves by default
  h.tenantStub.list = [ownerTenant];
  h.tenantStub.createError = null;
  h.tenantStub.createdNames = [];
});

/** POST a JSON body with a staff (or given) token. */
async function post(path: string, body: unknown, token: string) {
  return h.app.request(path, await json(h, body, token));
}

async function countRestaurants(tenant: string): Promise<number> {
  const r = (await sql`SELECT count(*)::int AS n FROM restaurants WHERE tenant_id = ${tenant}`.execute(
    h.db.root,
  )) as { rows: { n: number }[] };
  return r.rows[0]!.n;
}

// A minimal valid import document; tests clone + corrupt it.
const validImport = () => ({
  tenantId: TENANT,
  payload: {
    restaurant: { name: "Bella Napoli", defaultLanguage: "en" },
    menus: [
      { name: "Dinner", categories: [{ name: "Pizzas", items: [{ name: "Margherita", priceCents: 950 }] }] },
    ],
  },
});

// ── role gate ────────────────────────────────────────────────────────────────
test("create + import + tenants are role-gated (a plain user token is 403)", async () => {
  const user = await mintUserToken(h, { roles: [] });
  expect((await post("/api/staff/restaurants", { name: "X", tenantId: TENANT }, user)).status).toBe(403);
  expect((await post("/api/staff/restaurants/import", validImport(), user)).status).toBe(403);
  expect((await h.app.request("/api/staff/tenants", { headers: bearer(user) })).status).toBe(403);
});

// ── manual create: red paths ─────────────────────────────────────────────────
test("manual create rejects a missing/blank name (422)", async () => {
  const s = await staffToken(h);
  expect((await post("/api/staff/restaurants", { tenantId: TENANT }, s)).status).toBe(422);
  expect((await post("/api/staff/restaurants", { name: "   ", tenantId: TENANT }, s)).status).toBe(422);
});

test("manual create requires exactly one of tenantId / newTenantName", async () => {
  const s = await staffToken(h);
  expect((await post("/api/staff/restaurants", { name: "A" }, s)).status).toBe(422); // neither
  const both = await post("/api/staff/restaurants", { name: "A", tenantId: TENANT, newTenantName: "Dup" }, s);
  expect(both.status).toBe(422); // both
  expect(h.tenantStub.createdNames).toHaveLength(0); // never reached the tenant write
});

test("manual create rejects an unknown default language (422)", async () => {
  const s = await staffToken(h);
  expect((await post("/api/staff/restaurants", { name: "A", tenantId: TENANT, defaultLanguage: "zz" }, s)).status).toBe(422);
});

test("manual create 422s when the chosen existing tenant does not resolve", async () => {
  const s = await staffToken(h);
  h.tenantStub.value = null; // auth says the tenant is gone / ownerless
  expect((await post("/api/staff/restaurants", { name: "A", tenantId: TENANT }, s)).status).toBe(422);
  expect(await countRestaurants(TENANT)).toBe(0);
});

test("manual create maps auth's bad-tenant-name (422) to a 422", async () => {
  const s = await staffToken(h);
  h.tenantStub.createError = 422; // auth rejects the new tenant name (valid length, reaches auth)
  expect((await post("/api/staff/restaurants", { name: "A", newTenantName: "Rejected Co" }, s)).status).toBe(422);
  expect(h.tenantStub.createdNames).toEqual(["Rejected Co"]); // the auth call was attempted
  expect(await countRestaurants(NEW_TENANT)).toBe(0); // no restaurant under the rejected tenant
});

// ── import: red paths ────────────────────────────────────────────────────────
test("import rejects a structurally invalid payload (422), writing nothing", async () => {
  const s = await staffToken(h);
  const bad = async (mut: (doc: ReturnType<typeof validImport>) => void) => {
    const doc = validImport();
    mut(doc);
    return (await post("/api/staff/restaurants/import", doc, s)).status;
  };
  expect(await bad((d) => (d.payload.menus = []))).toBe(422); // no menus
  expect(await bad((d) => delete (d.payload as { restaurant?: unknown }).restaurant)).toBe(422); // no restaurant
  expect(await bad((d) => (d.payload.menus[0]!.categories[0]!.items[0]!.priceCents = -1))).toBe(422); // negative price
  expect(await bad((d) => (d.payload.menus[0]!.categories[0]!.items[0]!.priceCents = 9.99))).toBe(422); // non-integer price
  expect(await bad((d) => (d.payload.menus[0]!.categories[0]!.items[0]!.name = ""))).toBe(422); // blank item name
  expect(await bad((d) => (d.payload.restaurant.defaultLanguage = "zz"))).toBe(422); // bad language
  expect(await countRestaurants(TENANT)).toBe(0);
});

test("import rejects more than the per-document menu cap (422)", async () => {
  const s = await staffToken(h);
  const doc = validImport();
  doc.payload.menus = Array.from({ length: 21 }, (_, i) => ({ name: `Menu ${i}`, categories: [] })) as typeof doc.payload.menus;
  expect((await post("/api/staff/restaurants/import", doc, s)).status).toBe(422);
});

test("import rejects an over-budget total item count (422) without writing", async () => {
  const s = await staffToken(h);
  const doc = validImport();
  // 10 menus x 250 items = 2500 > the 2000 total cap (each category stays under its own cap).
  doc.payload.menus = Array.from({ length: 10 }, (_, m) => ({
    name: `Menu ${m}`,
    categories: [{ name: "Cat", items: Array.from({ length: 250 }, (_, i) => ({ name: `Item ${m}-${i}`, priceCents: 100 })) }],
  })) as typeof doc.payload.menus;
  expect((await post("/api/staff/restaurants/import", doc, s)).status).toBe(422);
  expect(await countRestaurants(TENANT)).toBe(0);
});

test("import requires a tenant (no payload.tenant + no tenantId → 422)", async () => {
  const s = await staffToken(h);
  const doc = validImport();
  delete (doc as { tenantId?: string }).tenantId;
  expect((await post("/api/staff/restaurants/import", doc, s)).status).toBe(422);
});

test("import 422s when the existing tenant does not resolve", async () => {
  const s = await staffToken(h);
  h.tenantStub.value = null;
  expect((await post("/api/staff/restaurants/import", validImport(), s)).status).toBe(422);
  expect(await countRestaurants(TENANT)).toBe(0);
});

test("import validates cheaply BEFORE creating a new tenant (no orphan tenant)", async () => {
  const s = await staffToken(h);
  const doc = validImport();
  delete (doc as { tenantId?: string }).tenantId;
  (doc.payload as { tenant?: string }).tenant = "Should Not Be Created";
  doc.payload.restaurant.defaultLanguage = "zz"; // fails up front, before the tenant write
  expect((await post("/api/staff/restaurants/import", doc, s)).status).toBe(422);
  expect(h.tenantStub.createdNames).toHaveLength(0); // no tenant was provisioned
  expect(await countRestaurants(NEW_TENANT)).toBe(0);
});

// ── green paths ──────────────────────────────────────────────────────────────
test("manual create under an existing tenant persists the restaurant", async () => {
  const s = await staffToken(h);
  const res = await post("/api/staff/restaurants", { name: "Bistro Uno", tenantId: TENANT }, s);
  expect(res.status).toBe(200);
  const { restaurant } = (await res.json()) as { restaurant: { slug: string; tenantId: string } };
  expect(restaurant.slug).toBe("bistro-uno");
  expect(restaurant.tenantId).toBe(TENANT);
});

test("manual create with a new tenant name provisions the tenant first", async () => {
  const s = await staffToken(h);
  const res = await post("/api/staff/restaurants", { name: "Fresh Co", newTenantName: "Fresh Holdings" }, s);
  expect(res.status).toBe(200);
  const { restaurant } = (await res.json()) as { restaurant: { tenantId: string } };
  expect(restaurant.tenantId).toBe(NEW_TENANT);
  expect(h.tenantStub.createdNames).toEqual(["Fresh Holdings"]);
});

test("import builds the full menu tree under an existing tenant", async () => {
  const s = await staffToken(h);
  const doc = validImport();
  doc.payload.restaurant.name = "Import One";
  doc.payload.menus = [
    {
      name: "Dinner",
      categories: [
        { name: "Pizzas", items: [{ name: "Margherita", priceCents: 950 }, { name: "Diavola", priceCents: 1150 }] },
        { name: "Drinks", items: [{ name: "Cola", priceCents: 250 }] },
      ],
    },
  ];
  const res = await post("/api/staff/restaurants/import", doc, s);
  expect(res.status).toBe(200);
  const { restaurant } = (await res.json()) as { restaurant: { id: string } };
  const items = (await sql`SELECT count(*)::int AS n FROM items WHERE restaurant_id = ${restaurant.id}`.execute(
    h.db.root,
  )) as { rows: { n: number }[] };
  expect(items.rows[0]!.n).toBe(3);
});

test("import supports variants, omitted price, and strips trailing dots", async () => {
  const s = await staffToken(h);
  const doc = validImport();
  // Use a fresh tenant so this doesn't consume the shared TENANT's restaurant
  // budget (the plan stub caps restaurants per tenant).
  delete (doc as { tenantId?: string }).tenantId;
  (doc.payload as { tenant?: string }).tenant = "Variants Co";
  doc.payload.restaurant.name = "Import Variants";
  doc.payload.menus = [
    {
      name: "Dinner",
      categories: [
        {
          name: "Pizzas",
          items: [
            // Variants carry their own prices; no item-level price.
            {
              name: "Diavola",
              variants: [
                { label: "Medium", priceCents: 1050 },
                { label: "Large", priceCents: 1350 },
              ],
            } as unknown as { name: string; priceCents: number },
            // Priceless dish (market price) — price omitted entirely.
            { name: "Catch of the day" } as unknown as { name: string; priceCents: number },
            // Trailing period stripped; a number prefix keeps its inner dot.
            { name: "1. Margherita.", priceCents: 950 },
          ],
        },
      ],
    },
  ];
  const res = await post("/api/staff/restaurants/import", doc, s);
  expect(res.status).toBe(200);
  const { restaurant } = (await res.json()) as { restaurant: { id: string } };

  const rows = (await sql`
    SELECT name, price_cents, variants FROM items WHERE restaurant_id = ${restaurant.id} ORDER BY position
  `.execute(h.db.root)) as { rows: { name: string; price_cents: number; variants: unknown }[] };

  const diavola = rows.rows.find((r) => r.name === "Diavola")!;
  expect(diavola.variants).not.toBeNull();
  expect(diavola.price_cents).toBe(0); // no item price when variants drive it

  const market = rows.rows.find((r) => r.name === "Catch of the day")!;
  expect(market.price_cents).toBe(0); // omitted price → 0 → renders as no price
  expect(market.variants).toBeNull();

  // Trailing "." gone, the "1." number prefix preserved.
  expect(rows.rows.some((r) => r.name === "1. Margherita")).toBe(true);
});

test("admin edit-as-JSON: export the menu, then replace it", async () => {
  const s = await staffToken(h);
  // Seed a restaurant + small menu under a fresh tenant.
  const doc = validImport();
  delete (doc as { tenantId?: string }).tenantId;
  (doc.payload as { tenant?: string }).tenant = "JsonEdit Co";
  doc.payload.restaurant.name = "Json Edit";
  doc.payload.menus = [
    { name: "Dinner", categories: [{ name: "Pizzas", items: [{ name: "Margherita", priceCents: 950 }] }] },
  ];
  const created = await post("/api/staff/restaurants/import", doc, s);
  expect(created.status).toBe(200);
  const { restaurant } = (await created.json()) as { restaurant: { id: string } };

  // Export → the import shape.
  const exp = await h.app.request(`/api/staff/restaurants/${restaurant.id}/menus`, { headers: bearer(s) });
  expect(exp.status).toBe(200);
  const exported = (await exp.json()) as {
    menus: { name: string; categories: { items: { name: string }[] }[] }[];
  };
  expect(exported.menus).toHaveLength(1);
  expect(exported.menus[0]!.categories[0]!.items[0]!.name).toBe("Margherita");

  // Replace with a different tree (one priceless item).
  const put = await h.app.request(
    `/api/staff/restaurants/${restaurant.id}/menus`,
    await jsonPut(
      h,
      { menus: [{ name: "Lunch", categories: [{ name: "Salads", items: [{ name: "Caesar", priceCents: 700 }, { name: "Greek" }] }] }] },
      s,
    ),
  );
  expect(put.status).toBe(200);

  const rows = (await sql`
    SELECT name, price_cents FROM items WHERE restaurant_id = ${restaurant.id} ORDER BY position
  `.execute(h.db.root)) as { rows: { name: string; price_cents: number }[] };
  expect(rows.rows.map((r) => r.name)).toEqual(["Caesar", "Greek"]); // old tree replaced
  expect(rows.rows.find((r) => r.name === "Greek")!.price_cents).toBe(0); // priceless

  // Release the new-tenant restaurant budget (the shared DB has a per-plan cap).
  await sql`DELETE FROM restaurants WHERE id = ${restaurant.id}`.execute(h.db.root);
});

test("import sets supportedLanguages and per-item translations", async () => {
  const s = await staffToken(h)
  const doc = validImport()
  doc.payload.restaurant.name = "Multi Lingo"
  ;(doc.payload.restaurant as { supportedLanguages?: string[] }).supportedLanguages = ["en", "pt"]
  // Cast away the base item type so the i18n fields survive to the wire (the
  // server stores them); runtime JSON keeps the extra keys.
  doc.payload.menus = [
    {
      name: "Dinner",
      categories: [
        {
          name: "Pizzas",
          items: [
            {
              name: "Margherita",
              priceCents: 950,
              nameI18n: { pt: "Margarida" },
              descriptionI18n: { pt: "Tomate, mozzarella, manjericão" },
            },
          ],
        },
      ],
    },
  ] as unknown as typeof doc.payload.menus
  const res = await post("/api/staff/restaurants/import", doc, s)
  expect(res.status).toBe(200)
  const { restaurant } = (await res.json()) as { restaurant: { id: string } }

  const rest = (await sql`SELECT supported_languages AS langs FROM restaurants WHERE id = ${restaurant.id}`.execute(
    h.db.root,
  )) as { rows: { langs: string[] }[] }
  expect(rest.rows[0]!.langs.sort()).toEqual(["en", "pt"])

  const item = (await sql`SELECT name_i18n AS n FROM items WHERE restaurant_id = ${restaurant.id}`.execute(
    h.db.root,
  )) as { rows: { n: Record<string, string> | null }[] }
  expect(item.rows[0]!.n?.pt).toBe("Margarida")
})

test("import rejects a translation for a non-supported language (422), writing nothing", async () => {
  const s = await staffToken(h)
  const doc = validImport()
  ;(doc.payload.restaurant as { supportedLanguages?: string[] }).supportedLanguages = ["en", "pt"]
  ;(doc.payload.menus[0]!.categories[0]!.items[0] as { nameI18n?: Record<string, string> }).nameI18n = {
    es: "Margarita", // es is not in supportedLanguages
  }
  const before = await countRestaurants(TENANT)
  expect((await post("/api/staff/restaurants/import", doc, s)).status).toBe(422)
  expect(await countRestaurants(TENANT)).toBe(before) // nothing written
})

test("import rejects an unknown supported language code (422)", async () => {
  const s = await staffToken(h)
  const doc = validImport()
  ;(doc.payload.restaurant as { supportedLanguages?: string[] }).supportedLanguages = ["en", "zz"]
  expect((await post("/api/staff/restaurants/import", doc, s)).status).toBe(422)
})

test("import with payload.tenant creates a new tenant and ignores the request tenantId", async () => {
  const s = await staffToken(h);
  const doc = validImport();
  doc.tenantId = TENANT; // present, but payload.tenant must win
  (doc.payload as { tenant?: string }).tenant = "Imported Holdings";
  doc.payload.restaurant.name = "Import Two";
  const res = await post("/api/staff/restaurants/import", doc, s);
  expect(res.status).toBe(200);
  const { restaurant } = (await res.json()) as { restaurant: { tenantId: string } };
  expect(restaurant.tenantId).toBe(NEW_TENANT);
  expect(h.tenantStub.createdNames).toEqual(["Imported Holdings"]);
});

test("GET /tenants returns the picker list", async () => {
  const res = await h.app.request("/api/staff/tenants", { headers: bearer(await staffToken(h)) });
  expect(res.status).toBe(200);
  const { tenants } = (await res.json()) as { tenants: { id: string; name: string }[] };
  expect(tenants).toHaveLength(1);
  expect(tenants[0]!.name).toBe("Acme Group");
});
