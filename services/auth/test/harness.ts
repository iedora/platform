import {
  Database,
  JwtIssuer,
  OutboxWriter,
  ServiceTokenIssuer,
  newServiceVerifier,
  newUserVerifier,
  parseClients,
  parseEd25519Seed,
} from "@iedora/menu-kit";
import { createScratchDatabase } from "@iedora/menu-kit/testkit";
import { afterAll, beforeAll } from "bun:test";

import { buildApp } from "../src/app";
import type { AuthConfig } from "../src/config";
import type { AuthDB } from "../src/schema";

// Shared test harness for every auth vertical slice. Each slice test owns its
// behaviour but reuses this setup + the request helpers below, so there is one
// copy of the boilerplate (scratch DB, app wiring, cookie/JWT parsing).

const SEED = "4qiWAUBUtlk6abEM+o0urqz3tGcSVjg8f/NyRa5wWeI=";

export interface Harness {
  app: ReturnType<typeof buildApp>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Database<any>;
  sentResets: { to: string; url: string }[]; // captured by the test mailer
  sentChanged: string[];
  serviceToken: string; // a valid service token (admin-bff) for service-authed routes
  close: () => Promise<void>;
}

/** Spins up a migrated scratch DB + the auth app with a capturing mailer. */
export async function createHarness(): Promise<Harness> {
  const scratch = await createScratchDatabase({
    prefix: "auth_test",
    migrationsDir: `${import.meta.dir}/../migrations`,
  });
  const db = new Database<AuthDB>(scratch.url, { camelCase: false });
  const sentResets: { to: string; url: string }[] = [];
  const sentChanged: string[] = [];
  const cfg: AuthConfig = {
    port: 0,
    authDatabaseUrl: scratch.url,
    auditBaseUrl: "", // relay not run in tests; audit events just queue in the outbox
    jwtSeed: SEED,
    jwtKeyId: "k1",
    jwtIssuer: "https://api.iedora.com",
    jwtAudience: "iedora-api",
    accessTtl: "15m",
    accessTtlMs: 15 * 6e4,
    refreshTtlMs: 30 * 864e5,
    refreshAbsoluteTtlMs: 90 * 864e5,
    refreshCookieName: "iedora_refresh",
    cookieDomain: "",
    cookieSecure: false,
    serviceClients: "admin-bff:dev-secret",
    serviceAudience: "iedora-internal",
    serviceTokenTtl: "10m",
    serviceTokenTtlMs: 10 * 6e4,
    roleGrants: [{ role: "admin", match: ["@iedora.com"] }], // every @iedora.com address is admin in tests

    resetTokenTtlMs: 30 * 6e4,
    resetThrottleMs: 0, // disabled so back-to-back test requests issue tokens
    resetUrlBase: "https://menu.iedora.com/reset-password",
  };
  const keys = parseEd25519Seed(SEED);
  const app = buildApp({
    db,
    issuer: new JwtIssuer({ keys, kid: "k1", issuer: cfg.jwtIssuer, audience: cfg.jwtAudience, accessTtl: cfg.accessTtl }),
    userVerifier: newUserVerifier(keys.publicKey, cfg.jwtIssuer, cfg.jwtAudience),
    serviceIssuer: new ServiceTokenIssuer({ privateKey: keys.privateKey, kid: "k1", issuer: cfg.jwtIssuer, audience: cfg.serviceAudience, ttl: cfg.serviceTokenTtl }),
    serviceVerifier: newServiceVerifier(keys.publicKey, cfg.jwtIssuer, cfg.serviceAudience),
    serviceClients: parseClients(cfg.serviceClients),
    auditor: new OutboxWriter(db, "auth"),
    resetMailer: {
      async sendPasswordReset(to, url) {
        sentResets.push({ to, url });
      },
      async sendPasswordChanged(to) {
        sentChanged.push(to);
      },
    },
    cfg,
  });
  // Mint a real service token via the client-credentials flow (admin-bff).
  const tokenRes = await app.request("/auth/token", {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from("admin-bff:dev-secret").toString("base64")}` },
  });
  const serviceToken = ((await tokenRes.json()) as { accessToken: string }).accessToken;
  return {
    app,
    db,
    sentResets,
    sentChanged,
    serviceToken,
    close: async () => {
      await db.close();
      await scratch.drop();
    },
  };
}

/** Registers an owner user, creates a tenant owned by them, and returns ids. */
export async function createTenantWithOwner(
  h: Harness,
  email: string,
): Promise<{ userId: string; tenantId: string; tenantName: string }> {
  const { access } = await registerUser(h, email);
  const userId = (claims(access) as { sub?: string }).sub ?? "";
  const res = await h.app.request("/auth/tenants", {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({ name: `Tenant for ${email}` }),
  });
  const { id, name } = (await res.json()) as { id: string; name: string };
  return { userId, tenantId: id, tenantName: name };
}

/** Registers the per-file lifecycle and returns a ctx populated before tests run. */
export function useHarness(): Harness {
  const ctx = {} as Harness;
  beforeAll(async () => Object.assign(ctx, await createHarness()));
  afterAll(() => ctx.close());
  return ctx;
}

// ── request helpers ─────────────────────────────────────────────────────────
export const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
export const withCookie = (token: string) => ({ method: "POST", headers: { cookie: `iedora_refresh=${token}` } });
export const bearer = (access: string) => ({ headers: { authorization: `Bearer ${access}` } });

/** Extracts the iedora_refresh cookie value from a response's Set-Cookie. */
export function refreshCookie(res: Response): string | undefined {
  for (const c of res.headers.getSetCookie()) {
    if (c.startsWith("iedora_refresh=")) return c.slice("iedora_refresh=".length).split(";")[0];
  }
  return undefined;
}

/** Decodes a JWT payload (no verification) to read its claims. */
export function claims(jwt: string): { roles?: string[] } {
  return JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString());
}

/** The `token` query param from the most recently "sent" reset link. */
export function lastResetToken(h: Harness): string {
  return new URL(h.sentResets.at(-1)!.url).searchParams.get("token")!;
}

const PASSWORD = "correct horse battery staple";

/** Registers a user and returns its access token + refresh cookie. */
export async function registerUser(
  h: Harness,
  email: string,
  password = PASSWORD,
): Promise<{ status: number; access: string; cookie?: string }> {
  const res = await h.app.request("/auth/register", json({ email, password, name: email }));
  const cookie = refreshCookie(res);
  const access = res.status === 200 ? ((await res.json()) as { accessToken: string }).accessToken : "";
  return { status: res.status, access, cookie };
}

export { PASSWORD };
