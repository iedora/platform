import { beforeAll, expect, test } from "bun:test";

import { TENANT, json, seedRestaurant, useHarness } from "./harness.ts";

// Uploads slice (scoped, under /restaurants/{slug}): presign → commit → clear.
// The harness wires storage as unconfigured (deps.uploads === null), so every
// upload route answers 503.
const h = useHarness("menu_uploads");

const RID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

beforeAll(async () => {
  await seedRestaurant(h, { id: RID, tenant: TENANT, slug: "tasca", defaultLanguage: "en", supportedLanguages: ["en"] });
});

test("uploads answer 503 when storage is unconfigured", async () => {
  const res = await h.app.request(
    `/api/restaurants/tasca/uploads/presign`,
    await json(h, { target: "restaurant-logo", contentType: "image/png" }),
  );
  expect(res.status).toBe(503);
});
