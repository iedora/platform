import { Database, newServiceVerifier } from "@iedora/server-kit";
import { createScratchDatabase } from "@iedora/server-kit/testkit";
import { SQL } from "bun";
import { afterAll, beforeAll } from "bun:test";
import { generateKeyPair, SignJWT } from "jose";

import { buildApp } from "../src/app";
import type { AuditDB } from "../src/schema";

// Shared test harness for every audit vertical slice. Each slice test owns its
// behaviour but reuses this setup + the request helpers below, so there is one
// copy of the boilerplate (scratch DB, app wiring, service-token minting).

const ISS = "https://api.iedora.com";
const AUD = "iedora-internal";

export interface Harness {
  app: ReturnType<typeof buildApp>;
  db: Database<AuditDB>;
  token: string; // a valid "service" token the verifier accepts
  url: string; // the scratch DB url (for direct seeding)
  close: () => Promise<void>;
}

/** Spins up a migrated scratch DB + the audit app with a fresh service verifier. */
export async function createHarness(): Promise<Harness> {
  const scratch = await createScratchDatabase({
    prefix: "audit_test",
    migrationsDir: `${import.meta.dir}/../migrations`,
  });

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

  const db = new Database<AuditDB>(scratch.url);
  const app = buildApp({ database: db, verifier });

  return {
    app,
    db,
    token,
    url: scratch.url,
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
/** Authorization header carrying the harness's valid service token. */
export const bearer = (h: Harness) => ({ headers: { authorization: `Bearer ${h.token}` } });

/** Inserts an audit_log row directly into the scratch DB (oldest -> newest by age). */
export async function seedEvents(
  h: Harness,
  rows: {
    source: string;
    action: string;
    ageSeconds?: number;
    outcome?: string;
    actorType?: string;
    targetId?: string;
  }[],
): Promise<void> {
  const sql = new SQL(h.url);
  for (const r of rows) {
    await sql.unsafe(
      `INSERT INTO audit_log (message_id, at, source, action, outcome, actor_type, target_id)
       VALUES (gen_random_uuid(), now() - ($1 || ' seconds')::interval, $2, $3, $4, $5, $6)`,
      [String(r.ageSeconds ?? 0), r.source, r.action, r.outcome ?? "success", r.actorType ?? "user", r.targetId ?? null],
    );
  }
  await sql.end();
}
