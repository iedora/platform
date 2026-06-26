import { SQL } from "bun";
import { afterAll, beforeAll, expect, test } from "bun:test";

import { Database, type EmailMessage, OutboxMailer, OutboxRelay, OutboxWriter, relayHandlers } from "../src";

// Bun-runtime integration test against a real Postgres (testcontainers hangs
// under Bun). Provisions two throwaway DBs — a producer (outbox) and the audit
// sink (audit_log) — mirroring the separate-DB topology.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://iedora:iedora@localhost:55433/postgres";

const tag = `${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
const producerName = `outbox_src_${tag}`;
const auditName = `outbox_audit_${tag}`;

function urlFor(db: string): string {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${db}`;
  return u.toString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let producer: Database<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let audit: Database<any>;

const OUTBOX_DDL = `
  CREATE TABLE outbox (
    id uuid NOT NULL DEFAULT uuidv7(),
    created_at timestamptz NOT NULL DEFAULT now(),
    subject text NOT NULL,
    payload bytea NOT NULL,
    traceparent text,
    published_at timestamptz,
    attempts int NOT NULL DEFAULT 0,
    last_error text,
    failed_at timestamptz,
    PRIMARY KEY (id)
  )`;

const AUDIT_DDL = `
  CREATE TABLE audit_log (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL,
    tenant_id uuid,
    action text NOT NULL,
    outcome text NOT NULL DEFAULT 'success',
    actor_type text NOT NULL DEFAULT 'system',
    actor_id text, target_type text, target_id text, session_id text, trace_id text,
    ip text, user_agent text,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    message_id uuid,
    PRIMARY KEY (id, at)
  );
  CREATE UNIQUE INDEX audit_log_message_id_idx ON audit_log (message_id, at);`;

beforeAll(async () => {
  const admin = new SQL(ADMIN_URL);
  await admin.unsafe(`CREATE DATABASE "${producerName}"`);
  await admin.unsafe(`CREATE DATABASE "${auditName}"`);
  await admin.end();

  const p = new SQL(urlFor(producerName));
  await p.unsafe(OUTBOX_DDL);
  await p.end();
  const a = new SQL(urlFor(auditName));
  await a.unsafe(AUDIT_DDL);
  await a.end();

  producer = new Database(urlFor(producerName));
  audit = new Database(urlFor(auditName));
});

afterAll(async () => {
  await producer?.close();
  await audit?.close();
  const admin = new SQL(ADMIN_URL);
  for (const db of [producerName, auditName]) {
    await admin
      .unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [db])
      .catch(() => {});
    await admin.unsafe(`DROP DATABASE IF EXISTS "${db}"`).catch(() => {});
  }
  await admin.end();
});

async function auditCount(): Promise<number> {
  const sql = new SQL(urlFor(auditName));
  const r = (await sql.unsafe(`SELECT count(*)::int AS n FROM audit_log`)) as { n: number }[];
  await sql.end();
  return r[0]!.n;
}

test("writer + relay deliver an outbox event into audit_log", async () => {
  const writer = new OutboxWriter(producer, "auth");
  await writer.recordSync({
    action: "auth.session.login",
    outcome: "success",
    actor: { type: "user", id: "u-1" },
  });

  const relay = new OutboxRelay(producer, relayHandlers({ audit: audit.root }));
  const published = await relay.drainOnce();
  expect(published).toBe(1);
  expect(await auditCount()).toBe(1);

  const sql = new SQL(urlFor(producerName));
  const rows = (await sql.unsafe(
    `SELECT published_at, failed_at FROM outbox`,
  )) as { published_at: unknown; failed_at: unknown }[];
  await sql.end();
  expect(rows[0]!.published_at).not.toBeNull();
  expect(rows[0]!.failed_at).toBeNull();
});

test("a poison payload is dead-lettered, not delivered", async () => {
  const sql = new SQL(urlFor(producerName));
  await sql.unsafe(`INSERT INTO outbox (subject, payload) VALUES ('audit.events', $1)`, [
    Buffer.from("this is not json"),
  ]);
  await sql.end();

  const relay = new OutboxRelay(producer, relayHandlers({ audit: audit.root }));
  await relay.drainOnce();

  const sql2 = new SQL(urlFor(producerName));
  const dead = (await sql2.unsafe(
    `SELECT count(*)::int AS n FROM outbox WHERE failed_at IS NOT NULL`,
  )) as { n: number }[];
  await sql2.end();
  expect(dead[0]!.n).toBe(1);
  expect(await auditCount()).toBe(1); // unchanged — only the good event landed
});

test("OutboxMailer enqueues; the relay delivers it through the transport", async () => {
  // OutboxMailer.send writes an email.send row; the relay drains it into a
  // capturing transport (the real one would be SMTP).
  const sent: EmailMessage[] = [];
  await new OutboxMailer(producer).send({ to: "u@iedora.com", subject: "hello", text: "hi", html: "<p>hi</p>" });

  const relay = new OutboxRelay(
    producer,
    relayHandlers({ audit: audit.root, mailer: { async send(m) { sent.push(m); } } }),
  );
  const published = await relay.drainOnce();

  expect(published).toBe(1);
  expect(sent).toHaveLength(1);
  expect(sent[0]!.to).toBe("u@iedora.com");
  expect(sent[0]!.subject).toBe("hello");
  expect(await auditCount()).toBe(1); // unchanged — email didn't touch audit_log
});
