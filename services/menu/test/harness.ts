import { Database, OutboxWriter, newUserVerifier } from "@iedora/server-kit";
import { createScratchDatabase } from "@iedora/server-kit/testkit";
import { afterAll, beforeAll } from "bun:test";
import { type CryptoKey, SignJWT, generateKeyPair } from "jose";
import { sql } from "kysely";

import { buildApp } from "../src/app";
import type { MenuConfig } from "../src/config";
import { Plans } from "../src/plans";
import { Limiter } from "../src/ratelimit";
import type { MenuDB } from "../src/schema";

// Shared test harness for every menu vertical slice. Each slice test owns its
// behaviour but reuses this setup + the request/seed helpers below, so there is
// one copy of the boilerplate (scratch DB, app wiring, token minting, seeds).

export const ISS = "https://api.iedora.com";
export const AUD = "iedora-api";
export const TENANT = "11111111-1111-1111-1111-111111111111";
export const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
export const USER = "33333333-3333-3333-3333-333333333333";

export interface Harness {
  app: ReturnType<typeof buildApp>;
  db: Database<MenuDB>;
  privateKey: CryptoKey;
  planStub: { code: string }; // mutable so a test can flip the tenant's effective plan
  close: () => Promise<void>;
}

/** Spins up a migrated scratch DB + the menu app with a disabled rate limiter. */
export async function createHarness(prefix = "menu_test"): Promise<Harness> {
  const scratch = await createScratchDatabase({
    prefix,
    migrationsDir: `${import.meta.dir}/../migrations`,
  });
  const db = new Database<MenuDB>(scratch.url);
  const kp = await generateKeyPair("EdDSA");
  const planStub = { code: "menu_pro" };
  const app = buildApp({
    db,
    limiter: new Limiter(db, true),
    userVerifier: newUserVerifier(kp.publicKey, ISS, AUD),
    auditor: new OutboxWriter(db, "menu"),
    plans: new Plans({ planCode: async () => planStub.code }, db),
    uploads: null, // storage unconfigured → upload routes answer 503
    cfg: { rateLimitDisabled: true } as MenuConfig,
  });
  return {
    app,
    db,
    privateKey: kp.privateKey,
    planStub,
    close: async () => {
      await db.close();
      await scratch.drop();
    },
  };
}

/** Registers the per-file lifecycle and returns a ctx populated before tests run. */
export function useHarness(prefix?: string): Harness {
  const ctx = {} as Harness;
  beforeAll(async () => Object.assign(ctx, await createHarness(prefix)));
  afterAll(() => ctx.close());
  return ctx;
}

// ── token + request helpers ─────────────────────────────────────────────────
/** Mints a user access token. `tenant: null` issues a tenant-less token. */
export async function mintUserToken(
  h: Harness,
  opts: { tenant?: string | null; roles?: string[] } = {},
): Promise<string> {
  const claims: Record<string, unknown> = { typ: "access", roles: opts.roles ?? [] };
  if (opts.tenant !== null) claims.tid = opts.tenant ?? TENANT;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setSubject(USER)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime("10m")
    .sign(h.privateKey);
}

/** A cross-tenant staff token (role-gated, may carry no tenant). */
export const staffToken = (h: Harness) => mintUserToken(h, { tenant: null, roles: ["iedora-admin"] });

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Authed Bearer headers, minting a default tenant token when none is given. */
export const auth = async (h: Harness, token?: string) => bearer(token ?? (await mintUserToken(h)));

/** A JSON POST with a Bearer token (default tenant token when none is given). */
export const json = async (h: Harness, body: unknown, token?: string) => ({
  method: "POST",
  headers: { ...(await auth(h, token)), "content-type": "application/json" },
  body: JSON.stringify(body),
});
export const jsonPatch = async (h: Harness, body: unknown, token?: string) => ({
  ...(await json(h, body, token)),
  method: "PATCH",
});
export const jsonPut = async (h: Harness, body: unknown, token?: string) => ({
  ...(await json(h, body, token)),
  method: "PUT",
});

// ── seed helpers ────────────────────────────────────────────────────────────
/** Seeds a single restaurant; returns its id + slug. */
export async function seedRestaurant(
  h: Harness,
  opts: { id: string; tenant?: string; slug?: string; name?: string; description?: string; defaultLanguage?: string; supportedLanguages?: string[] },
): Promise<{ id: string; slug: string }> {
  const slug = opts.slug ?? "tasca";
  await sql`INSERT INTO restaurants (id, tenant_id, name, slug, description, default_language, supported_languages)
            VALUES (${opts.id}, ${opts.tenant ?? TENANT}, ${opts.name ?? "Tasca"}, ${slug},
                    ${opts.description ?? null}, ${opts.defaultLanguage ?? "en"},
                    ${sql.raw(`ARRAY[${(opts.supportedLanguages ?? ["en"]).map((l) => `'${l}'`).join(",")}]`)})`.execute(h.db.root);
  return { id: opts.id, slug };
}
