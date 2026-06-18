import { Database, OutboxWriter, newServiceVerifier } from "@iedora/server-kit";
import { type ScratchDatabase, createScratchDatabase } from "@iedora/server-kit/testkit";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "kysely";
import { generateKeyPair, SignJWT } from "jose";

import { buildApp } from "../src/app";
import type { BillingConfig } from "../src/config";
import type { BillingDB } from "../src/schema";

const ISS = "https://api.iedora.com";
const AUD = "iedora-internal";
const TENANT = "11111111-1111-1111-1111-111111111111";

let scratch: ScratchDatabase;
let db: Database<BillingDB>;
let app: ReturnType<typeof buildApp>;
let token: string;

beforeAll(async () => {
  scratch = await createScratchDatabase({
    prefix: "billing_test",
    migrationsDir: `${import.meta.dir}/../migrations`,
  });
  const url = scratch.url;

  // Ephemeral EdDSA keypair: verifier from the public key, token from the private.
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const verifier = newServiceVerifier(publicKey, ISS, AUD);
  token = await new SignJWT({ typ: "service" })
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setSubject("admin-bff")
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime("10m")
    .sign(privateKey);

  db = new Database<BillingDB>(url);
  const cfg: BillingConfig = {
    port: 0,
    billingDatabaseUrl: url,
    auditDatabaseUrl: url, // audit events queue in this DB's outbox (relay not run here)
    serviceJwtPublicKey: "",
    serviceJwtIssuer: ISS,
    serviceAudience: AUD,
    periodMs: 30 * 864e5,
  };
  app = buildApp({ db, verifier, auditor: new OutboxWriter(db, "billing"), cfg });
});

afterAll(async () => {
  await db?.close();
  await scratch?.drop();
});

// A function, not a const: `token` is only set in beforeAll, after module load.
const bearer = () => ({ authorization: `Bearer ${token}` });
const post = (body: unknown) => ({
  method: "POST",
  headers: { ...bearer(), "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function outboxCount(): Promise<number> {
  const r = await sql<{ n: string }>`SELECT count(*)::text AS n FROM outbox`.execute(db.root);
  return Number(r.rows[0]!.n);
}

test("rejects requests without a service token", async () => {
  expect((await app.request("/billing/subscriptions?tenant=" + TENANT)).status).toBe(401);
  expect((await app.request("/billing/subscribe", { method: "POST", body: "{}" })).status).toBe(401);
});

test("subscribe to a paid plan creates a subscription + an invoice + an audit event", async () => {
  const before = await outboxCount();
  const res = await app.request("/billing/subscribe", post({ tenantId: TENANT, planCode: "menu_pro" }));
  expect(res.status).toBe(200);
  const sub = (await res.json()) as { product: string; planCode: string; status: string };
  expect(sub.product).toBe("menu");
  expect(sub.planCode).toBe("menu_pro");
  expect(sub.status).toBe("active");

  const inv = await app.request("/billing/invoices?tenant=" + TENANT, { headers: bearer() });
  const { invoices } = (await inv.json()) as { invoices: { amountCents: number; planCode: string }[] };
  expect(invoices.length).toBe(1);
  expect(invoices[0]!.amountCents).toBe(1900);
  expect(invoices[0]!.planCode).toBe("menu_pro");

  // The audit event committed in the same tx → exactly one new outbox row.
  expect(await outboxCount()).toBe(before + 1);
});

test("subscribing to a free plan upserts the subscription but issues no invoice", async () => {
  const tenant = "22222222-2222-2222-2222-222222222222";
  const res = await app.request("/billing/subscribe", post({ tenantId: tenant, planCode: "menu_free" }));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { planCode: string }).planCode).toBe("menu_free");

  const inv = await app.request("/billing/invoices?tenant=" + tenant, { headers: bearer() });
  expect(((await inv.json()) as { invoices: unknown[] }).invoices.length).toBe(0);
});

test("re-subscribing upserts in place (one row per tenant+product)", async () => {
  const res = await app.request("/billing/subscribe", post({ tenantId: TENANT, planCode: "menu_agency" }));
  expect(res.status).toBe(200);

  const list = await app.request("/billing/subscriptions?tenant=" + TENANT, { headers: bearer() });
  const { subscriptions } = (await list.json()) as { subscriptions: { planCode: string; status: string }[] };
  expect(subscriptions.length).toBe(1); // upserted, not duplicated
  expect(subscriptions[0]!.planCode).toBe("menu_agency");
  expect(subscriptions[0]!.status).toBe("active");
});

test("an unknown plan is rejected (400)", async () => {
  const res = await app.request("/billing/subscribe", post({ tenantId: TENANT, planCode: "nope" }));
  expect(res.status).toBe(400);
});

test("cancel ends the subscription; a second cancel is 404", async () => {
  const ok = await app.request("/billing/cancel", post({ tenantId: TENANT, product: "menu" }));
  expect(ok.status).toBe(200);

  const list = await app.request("/billing/subscriptions?tenant=" + TENANT, { headers: bearer() });
  const { subscriptions } = (await list.json()) as { subscriptions: { status: string }[] };
  expect(subscriptions[0]!.status).toBe("canceled");

  const again = await app.request("/billing/cancel", post({ tenantId: TENANT, product: "menu" }));
  expect(again.status).toBe(404);
});

test("listing subscriptions without a tenant is a 400", async () => {
  expect((await app.request("/billing/subscriptions", { headers: bearer() })).status).toBe(400);
});

test("the recent-invoices feed returns invoices across tenants", async () => {
  const res = await app.request("/billing/invoices?limit=10", { headers: bearer() });
  expect(res.status).toBe(200);
  const { invoices } = (await res.json()) as { invoices: { id: string }[] };
  expect(invoices.length).toBeGreaterThanOrEqual(1); // at least the menu_pro invoice above
});
