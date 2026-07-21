import { beforeAll, expect, test } from "bun:test";

import { TENANT, json, seedRestaurant, useHarness } from "./harness";

// Uploads slice — the configured-storage path. The harness wires a real
// `Uploads` over an in-memory blob (`withUploads`), so we exercise the full
// presign → (browser PUT) → commit → clear flow through the Hono routes: key
// scoping, the stat/size/content-type checks commit enforces, URL persistence,
// and object cleanup. Complements uploads.test.ts (the unconfigured 503 path).
const h = useHarness("menu_uploads_storage", { withUploads: true });

const RID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeAll(async () => {
  await seedRestaurant(h, { id: RID, tenant: TENANT, slug: "tasca", defaultLanguage: "en", supportedLanguages: ["en"] });
});

const presign = async (body: unknown) =>
  h.app.request("/api/restaurants/tasca/uploads/presign", await json(h, body));

test("presign issues a scoped key + upload URL for a restaurant asset", async () => {
  const res = await h.app.request(
    "/api/restaurants/tasca/uploads/presign",
    await json(h, { target: "restaurant-logo", contentType: "image/png" }),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { key: string; uploadUrl: string; publicUrl: string; maxBytes: number };
  // Every key is namespaced under the restaurant id — the tenancy boundary.
  expect(body.key.startsWith(`r/${RID}/logo/`)).toBe(true);
  expect(body.key.endsWith(".png")).toBe(true);
  expect(body.uploadUrl).toContain(body.key);
  expect(body.maxBytes).toBeGreaterThan(0);
});

test("presign rejects a non-image content type (422)", async () => {
  const res = await h.app.request(
    "/api/restaurants/tasca/uploads/presign",
    await json(h, { target: "restaurant-logo", contentType: "application/pdf" }),
  );
  expect(res.status).toBe(422);
});

test("commit persists the public URL once the object is in storage", async () => {
  // 1. presign
  const pres = await h.app.request(
    "/api/restaurants/tasca/uploads/presign",
    await json(h, { target: "restaurant-logo", contentType: "image/png" }),
  );
  const { key, publicUrl } = (await pres.json()) as { key: string; publicUrl: string };

  // 2. the browser PUTs the file — simulate the object landing in the bucket.
  h.blob!.put(key, "image/png", 4096);

  // 3. commit verifies the object + publishes its URL.
  const res = await h.app.request(
    "/api/restaurants/tasca/uploads/commit",
    await json(h, { target: "restaurant-logo", key }),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { url: string };
  expect(body.url).toBe(publicUrl);

  // 4. clear drops the asset + deletes the stored object.
  const cleared = await h.app.request(
    "/api/restaurants/tasca/uploads/clear",
    await json(h, { target: "restaurant-logo" }),
  );
  expect(cleared.status).toBe(200);
  expect(h.blob!.deleted).toContain(key);
});

test("commit refuses a key from another restaurant (422)", async () => {
  const res = await h.app.request(
    "/api/restaurants/tasca/uploads/commit",
    await json(h, { target: "restaurant-logo", key: "r/ffffffff-ffff-ffff-ffff-ffffffffffff/logo/x.png" }),
  );
  expect(res.status).toBe(422);
});

test("commit refuses to publish an object that was never PUT (422)", async () => {
  const pres = await presign({ target: "restaurant-logo", contentType: "image/png" });
  const { key } = (await pres.json()) as { key: string };
  // No `h.blob.put(...)` — the object isn't in storage.
  const res = await h.app.request(
    "/api/restaurants/tasca/uploads/commit",
    await json(h, { target: "restaurant-logo", key }),
  );
  expect(res.status).toBe(422);
});
