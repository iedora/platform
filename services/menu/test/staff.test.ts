import { Database, OutboxWriter, newUserVerifier } from "@iedora/server-kit";
import { type ScratchDatabase, createScratchDatabase } from "@iedora/server-kit/testkit";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "kysely";
import { type KeyLike, SignJWT, generateKeyPair } from "jose";

import { buildApp } from "../src/app";
import type { MenuConfig } from "../src/config";
import { Plans } from "../src/plans";
import { Limiter } from "../src/ratelimit";
import type { MenuDB } from "../src/schema";

const ISS = "https://api.iedora.com";
const AUD = "iedora-api";
const TENANT = "11111111-1111-1111-1111-111111111111";
const RID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

let scratch: ScratchDatabase;
let db: Database<MenuDB>;
let app: ReturnType<typeof buildApp>;
let privateKey: KeyLike;

beforeAll(async () => {
  scratch = await createScratchDatabase({ prefix: "menu_staff", migrationsDir: `${import.meta.dir}/../migrations` });
  db = new Database<MenuDB>(scratch.url);
  const kp = await generateKeyPair("EdDSA");
  privateKey = kp.privateKey;
  app = buildApp({
    db,
    limiter: new Limiter(db, true),
    userVerifier: newUserVerifier(kp.publicKey, ISS, AUD),
    auditor: new OutboxWriter(db, "menu"),
    plans: new Plans({ planCode: async () => "menu_pro" }, db),
    uploads: null, // storage unconfigured → upload routes answer 503
    cfg: { rateLimitDisabled: true } as MenuConfig,
  });

  // Seed a restaurant with a menu + item + an unbound QR sticker.
  const k = db.root;
  await sql`INSERT INTO restaurants (id, tenant_id, name, slug, default_language, supported_languages)
            VALUES (${RID}, ${TENANT}, 'Tasca', 'tasca', 'en', ARRAY['en'])`.execute(k);
  await sql`INSERT INTO menus (id, restaurant_id, name, active) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', ${RID}, 'M', true)`.execute(k);
  await sql`INSERT INTO categories (id, menu_id, restaurant_id, name) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd','cccccccc-cccc-cccc-cccc-cccccccccccc', ${RID}, 'C')`.execute(k);
  await sql`INSERT INTO items (category_id, restaurant_id, name, price_cents) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', ${RID}, 'Dish', 500)`.execute(k);
});

afterAll(async () => {
  await db?.close();
  await scratch?.drop();
});

async function token(opts: { tenant?: string | null; roles?: string[] } = {}): Promise<string> {
  const claims: Record<string, unknown> = { typ: "access", roles: opts.roles ?? [] };
  if (opts.tenant !== null) claims.tid = opts.tenant ?? TENANT;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setSubject("u")
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime("10m")
    .sign(privateKey);
}
const staff = () => token({ tenant: null, roles: ["iedora-admin"] });
const headers = async (t: string) => ({ authorization: `Bearer ${t}` });
const jpost = async (t: string, body: unknown) => ({
  method: "POST",
  headers: { ...(await headers(t)), "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("the staff surface is role-gated (a plain user token is 403)", async () => {
  const user = await token({ roles: [] });
  expect((await app.request("/api/staff/overview", { headers: await headers(user) })).status).toBe(403);
});

test("staff overview returns the platform snapshot", async () => {
  const res = await app.request("/api/staff/overview", { headers: await headers(await staff()) });
  expect(res.status).toBe(200);
  const o = (await res.json()) as { restaurants: number; items: number; topByViews: unknown[] };
  expect(o.restaurants).toBe(1);
  expect(o.items).toBe(1);
  expect(Array.isArray(o.topByViews)).toBe(true);
});

test("QR admin: bulk create, list, bind, then it resolves publicly", async () => {
  const s = await staff();
  const created = await app.request("/api/staff/qr-codes", await jpost(s, { count: 3 }));
  expect(((await created.json()) as { inserted: number }).inserted).toBe(3);

  const list = await app.request("/api/staff/qr-codes", { headers: await headers(s) });
  const codes = ((await list.json()) as { codes: { code: string; boundAt?: string }[] }).codes;
  expect(codes.length).toBe(3);

  const code = codes[0]!.code;
  const bind = await app.request(`/api/staff/qr-codes/${code}/bind`, await jpost(s, { restaurantId: RID }));
  expect(bind.status).toBe(200);

  // public scan resolution now finds the bound restaurant
  const resolved = await app.request(`/public/qr/${code}`);
  expect(((await resolved.json()) as { slug: string }).slug).toBe("tasca");
});

test("staff directory search + drill-in", async () => {
  const s = await staff();
  const dir = await app.request("/api/staff/directory?q=tas", { headers: await headers(s) });
  const rows = ((await dir.json()) as { restaurants: { id: string; items: number }[] }).restaurants;
  expect(rows.length).toBe(1);
  expect(rows[0]!.items).toBe(1);

  const detail = await app.request(`/api/staff/directory/${RID}`, { headers: await headers(s) });
  const d = (await detail.json()) as { restaurant: { slug: string }; trend: unknown[] };
  expect(d.restaurant.slug).toBe("tasca");
  expect(d.trend.length).toBe(14); // 13 days back + today
});

test("staff alerts flag the empty-menu restaurant has items (so not flagged) + unbound count", async () => {
  const res = await app.request("/api/staff/alerts", { headers: await headers(await staff()) });
  const a = (await res.json()) as { emptyMenus: unknown[]; unboundQr: number };
  expect(a.emptyMenus.length).toBe(0); // our seed restaurant has an item
  expect(a.unboundQr).toBe(2); // 3 created, 1 bound
});

test("uploads answer 503 when storage is unconfigured", async () => {
  const t = await token(); // tenant-scoped
  const res = await app.request(`/api/restaurants/tasca/uploads/presign`, await jpost(t, { target: "restaurant-logo", contentType: "image/png" }));
  expect(res.status).toBe(503);
});
