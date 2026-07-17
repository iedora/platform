import { Database, OutboxWriter, newServiceVerifier } from "@iedora/menu-kit";
import { createScratchDatabase } from "@iedora/menu-kit/testkit";
import { buildApp as buildBillingApp } from "@iedora/service-billing/app";
import type { BillingConfig } from "@iedora/service-billing/config";
import { ManualKind } from "@iedora/service-billing/kinds";
import type { BillingDB } from "@iedora/service-billing/schema";
import { BillingClient } from "@iedora/service-menu/billing";
import { afterAll, beforeAll } from "bun:test";
import { SignJWT, generateKeyPair } from "jose";
import { sql } from "kysely";

// Cross-service integration harness. Unlike the per-service slice tests (which
// stub their peers), this stands up the REAL billing Hono app on a real port
// over a real Postgres, and points the REAL menu BillingClient at it through a
// genuine service-token handshake. So a test exercises both sides of the
// menu↔billing contract end to end: HTTP, auth, the billing transaction, and
// the audit outbox.

const ISS = "https://api.iedora.com";
const AUD = "iedora-internal";

export interface IntegrationHarness {
  /** The real menu-side client, talking to the live billing server. */
  billing: BillingClient;
  /** The billing service's database (for seeding + asserting on the outbox). */
  billingDb: Database<BillingDB>;
  /** A fresh in-tx auditor over the billing DB (e.g. for the expiry sweep). */
  billingAuditor: () => OutboxWriter<BillingDB>;
  close: () => Promise<void>;
}

/** Spins up the billing service + a wired-up menu BillingClient. */
export async function createIntegration(): Promise<IntegrationHarness> {
  const scratch = await createScratchDatabase({
    prefix: "integration_billing",
    migrationsDir: `${import.meta.dir}/../../services/billing/migrations`,
  });
  const billingDb = new Database<BillingDB>(scratch.url);

  // Ephemeral EdDSA keypair: the billing verifier trusts the public key; the
  // menu client presents a token signed with the private key.
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const verifier = newServiceVerifier(publicKey, ISS, AUD);
  const serviceToken = await new SignJWT({ typ: "service" })
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setSubject("menu")
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime("10m")
    .sign(privateKey);

  const cfg: BillingConfig = {
    port: 0,
    billingDatabaseUrl: scratch.url,
    // Audit is delivered over HTTP by the relay, which is not run in this harness
    // (events just queue in the outbox); these are unused here.
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
  const app = buildBillingApp({
    db: billingDb,
    verifier,
    auditor: new OutboxWriter(billingDb, "billing"),
    kinds: { manual: new ManualKind() },
    cfg,
  });

  const server = Bun.serve({ port: 0, fetch: app.fetch });
  const base = `http://localhost:${server.port}`;
  const billing = new BillingClient(base, { token: async () => serviceToken });

  return {
    billing,
    billingDb,
    billingAuditor: () => new OutboxWriter(billingDb, "billing"),
    close: async () => {
      await server.stop(true);
      await billingDb.close();
      await scratch.drop();
    },
  };
}

/** Registers the per-file lifecycle and returns a ctx populated before tests run. */
export function useIntegration(): IntegrationHarness {
  const ctx = {} as IntegrationHarness;
  beforeAll(async () => Object.assign(ctx, await createIntegration()));
  afterAll(() => ctx.close());
  return ctx;
}

// ── assertion helpers ───────────────────────────────────────────────────────
/** The action + meta of every queued audit envelope, newest first. */
export async function auditEvents(
  h: IntegrationHarness,
): Promise<{ action: string; actorType: string; tenantId?: string; meta: Record<string, unknown> }[]> {
  // @iedora/messaging outbox_message: jsonb payload in @iedora/audit event shape.
  const r = await sql<{ payload: string }>`
    SELECT payload::text AS payload FROM outbox_message ORDER BY created_at DESC, id DESC
  `.execute(h.billingDb.root);
  return r.rows.map((row) => {
    const env = JSON.parse(row.payload) as {
      action: string;
      actorType: string;
      tenantId?: string | null;
      metadata: Record<string, unknown>;
    };
    return {
      action: env.action,
      actorType: env.actorType,
      tenantId: env.tenantId ?? undefined,
      meta: env.metadata ?? {},
    };
  });
}

/** A unique tenant id per call so tests never collide on the shared billing DB. */
let seq = 0;
export function freshTenant(): string {
  seq += 1;
  return `aaaaaaaa-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}
