import { expect, test } from "vitest";

import { bearer, useHarness } from "./harness.ts";

const h = useHarness();

async function postCharge(body: unknown) {
  return h.app.request("/billing/charges", {
    method: "POST",
    headers: { ...bearer(h), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("rejects without a service token", async () => {
  const res = await h.app.request("/billing/charges", { method: "POST", body: "{}" });
  expect(res.status).toBe(401);
});

test("kind is required (no default)", async () => {
  const res = await postCharge({ product: "menu", payer: "t1", amountCents: 1000, currency: "USD" });
  expect(res.status).toBe(400); // schema: kind missing
});

test("marketplace charge splits gross into platform fee + payee net (manual)", async () => {
  const res = await postCharge({
    product: "tutor",
    payer: "student-1",
    payee: "tutor-9",
    amountCents: 5000,
    currency: "USD",
    kind: "manual",
    feeRate: 0.2,
  });
  expect(res.status).toBe(200);
  const c = (await res.json()) as { id: string; feeCents: number; netCents: number; status: string; provider: string; payee: string };
  expect(c.feeCents).toBe(1000);
  expect(c.netCents).toBe(4000);
  expect(c.payee).toBe("tutor-9");
  expect(c.status).toBe("paid"); // manual records settled
  expect(c.provider).toBe("manual");

  const got = await h.app.request(`/billing/charges/${c.id}`, { headers: bearer(h) });
  expect(((await got.json()) as { id: string }).id).toBe(c.id);
});

test("platform-only charge keeps the whole amount (net 0)", async () => {
  const res = await postCharge({ product: "menu", payer: "tenant-abc", amountCents: 2999, currency: "USD", kind: "manual" });
  const c = (await res.json()) as { feeCents: number; netCents: number; payee: string | null };
  expect(c.feeCents).toBe(2999);
  expect(c.netCents).toBe(0);
  expect(c.payee).toBeNull();
});

test("idempotency key dedupes a retried charge", async () => {
  const body = { product: "menu", payer: "tenant-idem", amountCents: 1000, currency: "USD", kind: "manual", idempotencyKey: "charge-key-1" };
  const a = (await (await postCharge(body)).json()) as { id: string };
  const b = (await (await postCharge(body)).json()) as { id: string };
  expect(b.id).toBe(a.id);
});

test("a kind the service isn't configured for is rejected (stripe off in tests)", async () => {
  const res = await postCharge({ product: "tutor", payer: "s3", amountCents: 3000, currency: "USD", kind: "stripe", mode: "intent" });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toBe("kind_unavailable");
});
