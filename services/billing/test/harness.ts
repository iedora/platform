import { Database, OutboxWriter, newServiceVerifier } from "@iedora/menu-kit";
import { createScratchDatabase } from "@iedora/menu-kit/testkit";
import { afterAll, beforeAll } from "bun:test";
import { sql } from "kysely";
import { SignJWT, generateKeyPair } from "jose";

import { buildApp } from "../src/app";
import type { BillingConfig } from "../src/config";
import { ManualKind } from "../src/kinds";
import type { BillingDB } from "../src/schema";

// Shared test harness for every billing vertical slice. Each slice test owns its
// behaviour but reuses this setup + the request/token helpers below, so there is
// one copy of the boilerplate (scratch DB, app wiring, service-token signing).

const ISS = "https://api.iedora.com";
const AUD = "iedora-internal";
export const TENANT = "11111111-1111-1111-1111-111111111111";

export interface Harness {
  app: ReturnType<typeof buildApp>;
  db: Database<BillingDB>;
  token: string; // a valid service token (subject admin-bff)
  close: () => Promise<void>;
}

/** Spins up a migrated scratch DB + the billing app with an ephemeral service verifier. */
export async function createHarness(): Promise<Harness> {
  const scratch = await createScratchDatabase({
    prefix: "billing_test",
    migrationsDir: `${import.meta.dir}/../migrations`,
  });
  const url = scratch.url;

  // Ephemeral EdDSA keypair: verifier from the public key, token from the private.
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const verifier = newServiceVerifier(publicKey, ISS, AUD);
  const token = await new SignJWT({ typ: "service" })
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setSubject("admin-bff")
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime("10m")
    .sign(privateKey);

  const db = new Database<BillingDB>(url);
  const cfg: BillingConfig = {
    port: 0,
    billingDatabaseUrl: url,
    // relay not run in tests; audit events just queue in the outbox.
    auditBaseUrl: "",
    authBaseUrl: "",
    serviceClientId: "",
    serviceClientSecret: "",
    serviceJwtPublicKey: "",
    serviceJwtIssuer: ISS,
    serviceAudience: AUD,
    periodMs: 30 * 864e5,
    stripeSecretKey: "",
    stripeApiHost: "",
    stripeApiPort: 12111,
  };
  const app = buildApp({
    db,
    verifier,
    auditor: new OutboxWriter(db, "billing"),
    kinds: { manual: new ManualKind() },
    cfg,
  });

  return {
    app,
    db,
    token,
    close: async () => {
      await db.close();
      await scratch.drop();
    },
  };
}

/** Registers the per-file lifecycle and returns a ctx populated before tests run. */
export function useHarness(): Harness {
  const ctx = {} as Harness;
  beforeAll(async () => Object.assign(ctx, await createHarness()));
  afterAll(() => ctx.close());
  return ctx;
}

// ── request helpers ─────────────────────────────────────────────────────────
export const bearer = (h: Harness) => ({ authorization: `Bearer ${h.token}` });
export const post = (h: Harness, body: unknown) => ({
  method: "POST",
  headers: { ...bearer(h), "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Number of rows currently in the audit outbox. */
export async function outboxCount(h: Harness): Promise<number> {
  const r = await sql<{ n: string }>`SELECT count(*)::text AS n FROM outbox_message`.execute(h.db.root);
  return Number(r.rows[0]!.n);
}

/** Subscribes a tenant to a plan and returns the parsed subscription. */
export async function subscribe(
  h: Harness,
  tenantId: string,
  planCode: string,
): Promise<{ status: number; product?: string; planCode?: string; subStatus?: string }> {
  const res = await h.app.request("/billing/subscribe", post(h, { tenantId, planCode }));
  if (res.status !== 200) return { status: res.status };
  const sub = (await res.json()) as { product: string; planCode: string; status: string };
  return { status: res.status, product: sub.product, planCode: sub.planCode, subStatus: sub.status };
}

/** Lists a tenant's subscriptions. */
export async function listSubscriptions(
  h: Harness,
  tenant: string,
): Promise<{ status: number; subscriptions: { planCode: string; status: string }[] }> {
  const res = await h.app.request("/billing/subscriptions?tenant=" + tenant, { headers: bearer(h) });
  if (res.status !== 200) return { status: res.status, subscriptions: [] };
  const { subscriptions } = (await res.json()) as { subscriptions: { planCode: string; status: string }[] };
  return { status: res.status, subscriptions };
}

/** Lists invoices for a tenant (or the recent feed when no tenant is given). */
export async function listInvoices(
  h: Harness,
  query: string,
): Promise<{ status: number; invoices: { id: string; amountCents: number; planCode: string }[] }> {
  const res = await h.app.request("/billing/invoices?" + query, { headers: bearer(h) });
  const { invoices } = (await res.json()) as {
    invoices: { id: string; amountCents: number; planCode: string }[];
  };
  return { status: res.status, invoices };
}
