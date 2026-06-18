import { beforeAll, expect, test } from "bun:test";
import { sql } from "kysely";

import { seedRestaurant, useHarness } from "./harness";

// Public slice: the unauthenticated /public surface (localized rendering, QR
// resolution, view beacon). Seeds a restaurant tree once per file.
const h = useHarness("menu_public");

const RID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

beforeAll(async () => {
  await seedRestaurant(h, {
    id: RID,
    slug: "tasca",
    description: "Cozinha portuguesa",
    defaultLanguage: "en",
    supportedLanguages: ["en", "pt"],
  });
  const k = h.db.root;
  await sql`INSERT INTO menus (id, restaurant_id, name, position, active) VALUES (${MID}, ${RID}, 'Lunch', 0, true)`.execute(k);
  // an inactive menu — must not appear publicly
  await sql`INSERT INTO menus (restaurant_id, name, position, active) VALUES (${RID}, 'Hidden', 1, false)`.execute(k);
  await sql`INSERT INTO categories (id, menu_id, restaurant_id, name, position) VALUES (${CID}, ${MID}, ${RID}, 'Mains', 0)`.execute(k);
  // available item with a pt name override + a variant
  await sql`INSERT INTO items (category_id, restaurant_id, name, name_i18n, price_cents, currency, available, position, variants)
            VALUES (${CID}, ${RID}, 'Bacalhau', ${'{"pt":"Bacalhau à Brás"}'}::jsonb, 1200, 'EUR', true, 0, ${'[{"label":"Meia dose","priceCents":700}]'}::jsonb)`.execute(k);
  // unavailable item — must be dropped from the public payload
  await sql`INSERT INTO items (category_id, restaurant_id, name, price_cents, currency, available, position)
            VALUES (${CID}, ${RID}, 'Soldout', 999, 'EUR', false, 1)`.execute(k);
  // a bound QR sticker
  await sql`INSERT INTO qr_codes (code, restaurant_id, bound_at) VALUES ('abc123', ${RID}, now())`.execute(k);
});

test("public payload renders active menus, drops unavailable items, default language", async () => {
  const res = await h.app.request("/public/r/tasca");
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    restaurant: { name: string; description?: string };
    menus: { name: string; categories: { items: { name: string; variants: unknown[] }[] }[] }[];
    currentLanguage: string;
  };
  expect(body.restaurant.name).toBe("Tasca");
  expect(body.currentLanguage).toBe("en");
  expect(body.menus.length).toBe(1); // the inactive menu is hidden
  expect(body.menus[0]!.name).toBe("Lunch");
  const items = body.menus[0]!.categories[0]!.items;
  expect(items.length).toBe(1); // unavailable dropped
  expect(items[0]!.name).toBe("Bacalhau"); // default-language plain value
  expect(items[0]!.variants.length).toBe(1);
});

test("?lang=pt applies the i18n override", async () => {
  const res = await h.app.request("/public/r/tasca?lang=pt");
  const body = (await res.json()) as {
    currentLanguage: string;
    menus: { categories: { items: { name: string }[] }[] }[];
  };
  expect(body.currentLanguage).toBe("pt");
  expect(body.menus[0]!.categories[0]!.items[0]!.name).toBe("Bacalhau à Brás");
});

test("Accept-Language negotiates to a supported base tag", async () => {
  const res = await h.app.request("/public/r/tasca", { headers: { "accept-language": "pt-BR,en;q=0.8" } });
  expect(((await res.json()) as { currentLanguage: string }).currentLanguage).toBe("pt");
});

test("unknown slug is 404", async () => {
  expect((await h.app.request("/public/r/nope")).status).toBe(404);
});

test("QR resolve returns the bound slug; unknown code is 404", async () => {
  const ok = await h.app.request("/public/qr/abc123");
  expect(ok.status).toBe(200);
  expect(((await ok.json()) as { slug: string }).slug).toBe("tasca");
  expect((await h.app.request("/public/qr/zzz999")).status).toBe(404);
});

test("the view beacon serves a gif, sets a visitor cookie, and counts the view", async () => {
  const res = await h.app.request("/public/track/tasca");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/gif");
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("mm_v="));
  expect(cookie).toBeTruthy();
  const visitor = cookie!.slice("mm_v=".length).split(";")[0]!;

  // Replay with the same visitor in the same hour → deduped (no second count).
  await h.app.request("/public/track/tasca", { headers: { cookie: `mm_v=${visitor}` } });

  const r = await sql<{ count: string }>`SELECT coalesce(sum(count),0)::text AS count FROM daily_view WHERE restaurant_id=${RID}`.execute(h.db.root);
  expect(Number(r.rows[0]!.count)).toBe(1);
});
