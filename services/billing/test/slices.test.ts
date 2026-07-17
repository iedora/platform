import { expect, test } from "bun:test";

import { bearer, useHarness } from "./harness";

const h = useHarness();

function post(path: string, body: unknown) {
  return h.app.request(path, {
    method: "POST",
    headers: { ...bearer(h), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── payouts (record-only) ────────────────────────────────────────────────────
test("payout records a pending payout, readable back", async () => {
  const res = await post("/billing/payouts", { product: "tutor", payee: "tutor-1", amountCents: 4000, currency: "USD" });
  expect(res.status).toBe(200);
  const p = (await res.json()) as { id: string; status: string; payee: string; amountCents: number };
  expect(p.status).toBe("pending"); // recorded now, executed later
  expect(p.payee).toBe("tutor-1");
  expect(p.amountCents).toBe(4000);
  const got = await h.app.request(`/billing/payouts/${p.id}`, { headers: bearer(h) });
  expect(((await got.json()) as { id: string }).id).toBe(p.id);
});

test("payout requires payee + amount", async () => {
  const res = await post("/billing/payouts", { product: "tutor", currency: "USD" });
  expect(res.status).toBe(400);
});

// ── refund (kind-branched) ───────────────────────────────────────────────────
test("refund a manual charge records a refund via the same kind", async () => {
  const charge = (await (
    await post("/billing/charges", { product: "menu", payer: "t-ref", amountCents: 5000, currency: "USD", kind: "manual" })
  ).json()) as { id: string };

  const res = await post(`/billing/charges/${charge.id}/refund`, {});
  expect(res.status).toBe(200);
  const r = (await res.json()) as { status: string; amountCents: number; provider: string };
  expect(r.status).toBe("refunded"); // manual records the reversal
  expect(r.amountCents).toBe(5000); // full refund by default
  expect(r.provider).toBe("manual");
});

test("refunding an unknown charge is 404", async () => {
  const res = await post("/billing/charges/00000000-0000-4000-8000-000000000000/refund", {});
  expect(res.status).toBe(404);
});

// ── setup (stripe-only) ──────────────────────────────────────────────────────
test("setup rejects a non-stripe kind", async () => {
  const res = await post("/billing/payment-methods/setup", { kind: "manual" });
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toBe("kind_unavailable");
});

test("setup rejects when stripe isn't configured", async () => {
  const res = await post("/billing/payment-methods/setup", { kind: "stripe" });
  expect(res.status).toBe(400); // stripe kind absent in tests
});
