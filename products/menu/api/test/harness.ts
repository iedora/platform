import type {
  AdminUser,
  AdminUserDetail,
  AdminUserSession,
  AuditRecord,
  Invoice,
  Subscription,
  TenantWithOwner,
} from "@iedora/contracts";
import { Database, OutboxWriter, ServiceClientError, newUserVerifier } from "@iedora/service-runtime";
import { createScratchDatabase } from "@iedora/service-runtime/testkit";
import { afterAll, beforeAll } from "bun:test";
import { type CryptoKey, SignJWT, generateKeyPair } from "jose";
import { sql } from "kysely";

import { buildApp } from "../src/app";
import type { BlobClient } from "../src/blob";
import type { MenuConfig } from "../src/config";
import { Plans } from "../src/plans";
import { Limiter } from "../src/ratelimit";
import type { MenuDB } from "../src/schema";
import { Uploads } from "../src/uploads";

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
  /** Mutable billing/audit/tenant fakes for the staff aggregation endpoint. */
  billingStub: { subscriptions: Subscription[]; invoices: Invoice[] };
  auditStub: { events: AuditRecord[] };
  /** Users CRM fake: `list` drives GET /users, `detail` drives GET /users/:id
   * (null → 404), `sessions` the device history. The activity timeline reuses
   * `auditStub.events` (forActor). */
  userStub: { list: AdminUser[]; detail: AdminUserDetail | null; sessions: AdminUserSession[] };
  /** Tenant reader/admin fake. `value`/`fail` drive `tenant()` (existence +
   * best-effort path); `list` drives the picker; `createError`/`newTenantId`
   * drive new-tenant provisioning, and `createdNames` records the calls. */
  tenantStub: {
    value: TenantWithOwner | null;
    fail: boolean;
    list: TenantWithOwner[];
    createError: number | null;
    newTenantId: string;
    createdNames: string[];
  };
  /** In-memory object store, present only when the harness was built with
   * `withUploads` — lets upload tests assert what landed / was deleted. */
  blob: FakeBlob | null;
  close: () => Promise<void>;
}

export interface HarnessOptions {
  /** Wire a real `Uploads` over an in-memory blob so upload routes work
   * (instead of the default 503). Exposes the store on `h.blob`. */
  withUploads?: boolean;
  /** Run the real sliding-window limiter (default: disabled, as most slice
   * tests don't want it). Set false to assert 429 enforcement. */
  rateLimitDisabled?: boolean;
}

/**
 * In-memory stand-in for {@link BlobClient}. Covers exactly the surface
 * `Uploads` touches; `put()` simulates the browser's presigned PUT so a
 * later `commit()` finds the object. Records deletes for assertions.
 */
export class FakeBlob
  implements Pick<BlobClient, "presignPut" | "publicURL" | "keyFromPublicURL" | "stat" | "delete">
{
  readonly objects = new Map<string, { contentType: string; size: number }>();
  readonly deleted: string[] = [];
  private readonly base = "https://cdn.test";

  publicURL(key: string): string {
    return `${this.base}/${key}`;
  }
  keyFromPublicURL(url: string): string {
    const prefix = `${this.base}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : "";
  }
  presignPut(key: string): string {
    return `${this.base}/_put/${key}`;
  }
  /** Test helper — pretend the browser PUT the object to `key`. */
  put(key: string, contentType: string, size: number): void {
    this.objects.set(key, { contentType, size });
  }
   
  async stat(key: string) {
    const o = this.objects.get(key);
    return o ? { exists: true, ...o } : { exists: false, contentType: "", size: 0 };
  }
   
  async delete(key: string): Promise<void> {
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

/** Spins up a migrated scratch DB + the menu app. Rate limiter disabled and
 * storage unconfigured by default; opt into either via {@link HarnessOptions}. */
export async function createHarness(
  prefix = "menu_test",
  opts: HarnessOptions = {},
): Promise<Harness> {
  const scratch = await createScratchDatabase({
    prefix,
    migrationsDir: `${import.meta.dir}/../migrations`,
  });
  const db = new Database<MenuDB>(scratch.url, { camelCase: false });
  const kp = await generateKeyPair("EdDSA");
  const planStub = { code: "menu_pro" };
  const billingStub: { subscriptions: Subscription[]; invoices: Invoice[] } = {
    subscriptions: [],
    invoices: [],
  };
  const auditStub: { events: AuditRecord[] } = { events: [] };
  const userStub: Harness["userStub"] = { list: [], detail: null, sessions: [] };
  const tenantStub: Harness["tenantStub"] = {
    value: null,
    fail: false,
    list: [],
    createError: null,
    newTenantId: "99999999-9999-9999-9999-999999999999",
    createdNames: [],
  };
  const rateLimitDisabled = opts.rateLimitDisabled ?? true;
  let blob: FakeBlob | null = null;
  let uploads: Uploads | null = null;
  if (opts.withUploads) {
    blob = new FakeBlob();
    uploads = new Uploads(db, blob as unknown as BlobClient);
  }
  const app = buildApp({
    db,
    limiter: new Limiter(db, rateLimitDisabled),
    userVerifier: newUserVerifier(kp.publicKey, ISS, AUD),
    auditor: new OutboxWriter(db, "menu"),
    plans: new Plans({ planCode: async () => planStub.code }, db),
    billing: {
      subscriptions: async () => billingStub.subscriptions,
      invoices: async () => billingStub.invoices,
      recordPayment: async (input) => {
        const inv: Invoice = {
          id: `inv_${billingStub.invoices.length + 1}`,
          tenantId: input.tenantId,
          product: "menu",
          planCode: input.planCode,
          amountCents: input.amountCents,
          currency: input.currency,
          status: "paid",
          promo: input.promo ?? null,
          createdAt: new Date().toISOString(),
        };
        billingStub.invoices.unshift(inv);
        return inv;
      },
    },
    audit: {
      forTarget: async () => auditStub.events,
      forTenant: async () => auditStub.events,
      forActor: async () => auditStub.events,
    },
    tenant: {
      tenant: async () => {
        if (tenantStub.fail) throw new Error("auth unavailable");
        return tenantStub.value;
      },
      listTenants: async () => tenantStub.list,
      createTenant: async (name: string) => {
        tenantStub.createdNames.push(name);
        if (tenantStub.createError !== null) {
          throw new ServiceClientError("auth", "/auth/admin/tenants", tenantStub.createError);
        }
        return { id: tenantStub.newTenantId, name };
      },
      listUsers: async () => userStub.list,
      getUser: async () => userStub.detail,
      getUserSessions: async () => userStub.sessions,
      forcePasswordChange: async () => {},
      setUserPassword: async () => {},
      revokeUserSession: async () => {},
    },
    uploads, // null → upload routes answer 503; FakeBlob-backed when withUploads
    cfg: { rateLimitDisabled } as MenuConfig,
  });
  return {
    app,
    db,
    privateKey: kp.privateKey,
    planStub,
    billingStub,
    auditStub,
    userStub,
    tenantStub,
    blob,
    close: async () => {
      await db.close();
      await scratch.drop();
    },
  };
}

/** Registers the per-file lifecycle and returns a ctx populated before tests run. */
export function useHarness(prefix?: string, opts?: HarnessOptions): Harness {
  const ctx = {} as Harness;
  beforeAll(async () => Object.assign(ctx, await createHarness(prefix, opts)));
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
  if (opts.tenant !== null) claims.org = opts.tenant ?? TENANT;
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
