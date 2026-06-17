import { Database, newServiceVerifier, runMigrations } from "@iedora/server-kit";
import { SQL } from "bun";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { generateKeyPair, SignJWT } from "jose";

import { buildApp } from "../src/app";
import type { AuditDB } from "../src/schema";

// Tests run on the Bun runtime (the services use Bun's native SQL), so instead
// of testcontainers (whose Node docker-stream client hangs under Bun) we
// provision a throwaway database on a real Postgres. Defaults to the OrbStack
// dev Postgres (`bun run api:up`); CI sets TEST_DATABASE_URL to its pg service.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://iedora:iedora@localhost:55433/postgres";
const ISS = "https://api.iedora.com";
const AUD = "iedora-internal";

const scratch = `audit_test_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;

function urlFor(db: string): string {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${db}`;
  return u.toString();
}

let database: Database<AuditDB>;
let app: ReturnType<typeof buildApp>;
let token: string;

beforeAll(async () => {
  const admin = new SQL(ADMIN_URL);
  await admin.unsafe(`CREATE DATABASE "${scratch}"`);
  await admin.end();

  const url = urlFor(scratch);
  await runMigrations({ url, dir: `${import.meta.dir}/../migrations` });

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

  database = new Database<AuditDB>(url);
  app = buildApp({ database, verifier });

  const sql = new SQL(url);
  for (let i = 0; i < 3; i++) {
    await sql.unsafe(
      `INSERT INTO audit_log (message_id, at, source, action, outcome, actor_type)
       VALUES (gen_random_uuid(), now() - ($1 || ' seconds')::interval, 'auth', 'auth.session.login', 'success', 'user')`,
      [String(i)],
    );
  }
  await sql.unsafe(
    `INSERT INTO audit_log (message_id, at, source, action, outcome, actor_type)
     VALUES (gen_random_uuid(), now(), 'billing', 'billing.invoice.paid', 'success', 'service')`,
  );
  await sql.end();
});

afterAll(async () => {
  await database?.close();
  const admin = new SQL(ADMIN_URL);
  // Drop connections to the scratch DB, then drop it.
  await admin
    .unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [scratch])
    .catch(() => {});
  await admin.unsafe(`DROP DATABASE IF EXISTS "${scratch}"`).catch(() => {});
  await admin.end();
});

// A function, not a const: `token` is only set in beforeAll, after module load.
const bearer = () => ({ headers: { authorization: `Bearer ${token}` } });

test("rejects requests without a service token", async () => {
  expect((await app.request("/obs/events")).status).toBe(401);
});

test("queries events with a valid service token", async () => {
  const res = await app.request("/obs/events", bearer());
  expect(res.status).toBe(200);
  const body = (await res.json()) as { events: { action: string }[] };
  expect(body.events.length).toBe(4);
});

test("filters by action prefix", async () => {
  const res = await app.request("/obs/events?action=auth.", bearer());
  const body = (await res.json()) as { events: { action: string }[] };
  expect(body.events.length).toBe(3);
  expect(body.events.every((e) => e.action.startsWith("auth."))).toBe(true);
});

test("keyset pagination walks newest-first without overlap", async () => {
  const seen = new Set<string>();
  let q = "/obs/events?action=auth.&limit=2";
  for (;;) {
    const res = await app.request(q, bearer());
    const body = (await res.json()) as {
      events: { id: string }[];
      next?: { at: string; id: string };
    };
    if (body.events.length === 0) break;
    for (const e of body.events) {
      expect(seen.has(e.id)).toBe(false);
      seen.add(e.id);
    }
    if (!body.next) break;
    q = `/obs/events?action=auth.&limit=2&before_at=${encodeURIComponent(body.next.at)}&before_id=${body.next.id}`;
  }
  expect(seen.size).toBe(3);
});
