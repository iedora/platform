import { beforeAll, expect, test } from "bun:test";
import { sql } from "kysely";

import { auth, json, jsonPatch, seedRestaurant, staffToken, useHarness } from "./harness";

// Restaurant-identity slice: theme, slug rename, and delete — the
// per-restaurant settings, asserted through the public read model.
const h = useHarness("menu_restaurant");

const RID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

beforeAll(async () => {
  await seedRestaurant(h, { id: RID, slug: "casa", name: "Casa", defaultLanguage: "en" });
});

test("PATCH a theme → colours + layout surface on the public payload", async () => {
  const res = await h.app.request(
    "/api/restaurants/casa",
    await jsonPatch(h, { theme: { layout: "cards", primaryColor: "#1E8A52", secondaryColor: "#6b7280", font: "inter" } }),
  );
  expect(res.status).toBe(200);
  const pub = (await (await h.app.request("/public/r/casa")).json()) as {
    restaurant: { theme?: { primaryColor?: string; layout?: string } };
  };
  expect(pub.restaurant.theme?.primaryColor).toBe("#1E8A52");
  expect(pub.restaurant.theme?.layout).toBe("cards");
});

test("rename the slug → the new slug resolves, the old one 404s", async () => {
  const res = await h.app.request("/api/restaurants/casa/slug", await json(h, { slug: "nova-casa" }));
  expect(res.status).toBe(200);
  expect((await h.app.request("/public/r/nova-casa")).status).toBe(200);
  expect((await h.app.request("/public/r/casa")).status).toBe(404);
});

test("DELETE the restaurant → its slug stops resolving", async () => {
  const res = await h.app.request("/api/restaurants/nova-casa", { method: "DELETE", headers: await auth(h) });
  expect(res.status).toBe(200);
  expect((await h.app.request("/public/r/nova-casa")).status).toBe(404);
});

// --- QR print audit -------------------------------------------------------

const QR_RID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const PRINT_META = {
  kind: "sticker",
  code: "KASA-1",
  pageSize: "letter",
  qrSizeMm: 35,
  gutterMm: 6,
  pageMarginMm: 5,
  cutMarks: true,
  perSheet: 24,
};

async function printedEvents() {
  const rows = await sql<{ payload: string }>`
    SELECT convert_from(payload, 'UTF8') AS payload FROM outbox
  `.execute(h.db.root);
  return rows.rows
    .map((r) => JSON.parse(r.payload) as { action: string; targetId?: string; meta?: unknown })
    .filter((e) => e.action === "menu.restaurant.qr_printed");
}

test("qr-print records an audit event scoped to the restaurant, with the print options as meta", async () => {
  await seedRestaurant(h, { id: QR_RID, slug: "qrcasa", name: "QR Casa", defaultLanguage: "en" });

  const res = await h.app.request("/api/restaurants/qrcasa/qr-print", await json(h, PRINT_META));
  expect(res.status).toBe(200);

  const events = await printedEvents();
  const ev = events.find((e) => e.targetId === QR_RID);
  expect(ev).toBeDefined();
  // Rich metadata: the chosen print options ride along on the event.
  expect(ev!.meta).toMatchObject({ pageSize: "letter", cutMarks: true, perSheet: 24, kind: "sticker" });
});

test("staff can record a qr-print on any restaurant (cross-tenant)", async () => {
  const res = await h.app.request(
    "/api/restaurants/qrcasa/qr-print",
    await json(h, { ...PRINT_META, pageSize: "a4" }, await staffToken(h)),
  );
  expect(res.status).toBe(200);
  const events = await printedEvents();
  expect(events.some((e) => e.targetId === QR_RID && (e.meta as { pageSize?: string })?.pageSize === "a4")).toBe(true);
});

test("qr-print rejects an invalid page size", async () => {
  const res = await h.app.request(
    "/api/restaurants/qrcasa/qr-print",
    await json(h, { ...PRINT_META, pageSize: "tabloid" }),
  );
  expect(res.status).toBe(400);
});
