import { beforeAll, expect, test } from "bun:test";

import { Policies } from "../src/ratelimit";
import { TENANT, json, seedRestaurant, useHarness } from "./harness";

// Rate-limit enforcement — the real sliding-window limiter (rateLimitDisabled
// false) backed by the scratch DB, exercised through the presign route. Most
// slice tests disable the limiter; this one proves the guard actually denies.
// The `presign` policy allows 30/min, fail-closed.
const h = useHarness("menu_ratelimit", { withUploads: true, rateLimitDisabled: false });

const RID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

beforeAll(async () => {
  await seedRestaurant(h, { id: RID, tenant: TENANT, slug: "tasca", defaultLanguage: "en", supportedLanguages: ["en"] });
});

test("presign is allowed up to the policy limit, then 429s", async () => {
  const limit = Policies.presign!.limit;
  const body = await json(h, { target: "restaurant-logo", contentType: "image/png" });

  // The first `limit` requests succeed (one slot each).
  for (let i = 0; i < limit; i++) {
    const res = await h.app.request("/api/restaurants/tasca/uploads/presign", body);
    expect(res.status).toBe(200);
  }

  // The next one is over the window → denied.
  const denied = await h.app.request("/api/restaurants/tasca/uploads/presign", body);
  expect(denied.status).toBe(429);
  // Standard back-pressure header so clients know when to retry.
  expect(denied.headers.get("retry-after")).not.toBeNull();
});
