import { SQL } from "bun";
import { afterAll, beforeAll, expect, test } from "bun:test";

import { createAuditIngester } from "@iedora/audit";
import { createInbox, up as messagingUp } from "@iedora/messaging";
import {
  type AuditSink,
  Database,
  type EmailMessage,
  OutboxMailer,
  OutboxRelay,
  OutboxWriter,
  relayHandlers,
} from "../src";

// Bun-runtime integration test against a real Postgres. Provisions two throwaway
// DBs — a producer (outbox_message via @iedora/messaging) and the audit sink
// (audit_log). The relay delivers to the audit service over HTTP in prod; here
// the sink calls the audit service's own receiver in-process (same ingester +
// inbox dedup, minus the HTTP hop), so the end-to-end path is still exercised.
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

// The audit sink is now @iedora/audit's schema (partitioned) + @iedora/messaging's
// inbox for idempotent ingestion (the dispatcher's at-least-once redelivery is
// deduped by the inbox).
const AUDIT_DDL = `
  CREATE TABLE audit_log (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid, source text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor_type text, actor_id text,
    action text NOT NULL,
    entity_type text, entity_id text,
    outcome text NOT NULL DEFAULT 'success',
    old_data jsonb, new_data jsonb, changed_fields jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip text, user_agent text,
    PRIMARY KEY (id, occurred_at)
  ) PARTITION BY RANGE (occurred_at);
  CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;
  CREATE TABLE inbox_message (
    message_id text PRIMARY KEY, topic text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
  );`;

beforeAll(async () => {
  const admin = new SQL(ADMIN_URL);
  await admin.unsafe(`CREATE DATABASE "${producerName}"`);
  await admin.unsafe(`CREATE DATABASE "${auditName}"`);
  await admin.end();

  producer = new Database(urlFor(producerName));
  audit = new Database(urlFor(auditName));

  // Producer gets @iedora/messaging's outbox_message + inbox_message.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await messagingUp(producer.root as any);

  const a = new SQL(urlFor(auditName));
  await a.unsafe(AUDIT_DDL);
  await a.end();
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

// The audit service's ingestion, driven in-process (stands in for the HTTP POST
// the AuditClient makes in prod): dedupe by messageId + record into audit_log.
function localAuditSink(): AuditSink {
  // Compose the audit service's receiver inline (createAuditReceiver used to wrap
  // this in menu-kit; the audit service now owns it, so build it directly here).
  const ingest = createAuditIngester(createInbox(audit.root));
  const receive = (e: { messageId: string; payload: Record<string, unknown> }) =>
    ingest({ id: e.messageId, topic: "audit.events", payload: e.payload, attempts: 0 });
  return { ingest: async (events) => void (await Promise.all(events.map(receive))) };
}

test("writer + relay deliver an outbox event into audit_log (on @iedora/messaging)", async () => {
  const writer = new OutboxWriter(producer, "auth");
  await writer.recordSync({
    action: "auth.session.login",
    outcome: "success",
    actor: { type: "user", id: "u-1" },
  });

  const relay = new OutboxRelay(producer, relayHandlers({ audit: localAuditSink() }));
  const published = await relay.drainOnce();
  expect(published).toBe(1);
  expect(await auditCount()).toBe(1);

  // outbox_message row marked delivered.
  const sql = new SQL(urlFor(producerName));
  const rows = (await sql.unsafe(
    `SELECT delivered_at, dead_at FROM outbox_message`,
  )) as { delivered_at: unknown; dead_at: unknown }[];
  await sql.end();
  expect(rows[0]!.delivered_at).not.toBeNull();
  expect(rows[0]!.dead_at).toBeNull();
});

test("OutboxMailer enqueues; the relay delivers it through the transport", async () => {
  const sent: EmailMessage[] = [];
  await new OutboxMailer(producer).send({ to: "u@example.com", subject: "hello", text: "hi", html: "<p>hi</p>" });

  // The relay POSTs each queued email to the email service via the EmailSink
  // (email-sdk `deliver`), so the fake sink captures the delivered payloads.
  const captureSink = {
    deliver: async (msgs: { messageId: string; payload: Record<string, unknown> }[]) =>
      void msgs.forEach((m) => sent.push(m.payload as unknown as EmailMessage)),
  };
  const relay = new OutboxRelay(producer, relayHandlers({ audit: localAuditSink(), email: captureSink }));
  await relay.drainOnce();

  expect(sent).toHaveLength(1);
  expect(sent[0]!.to).toBe("u@example.com");
  expect(sent[0]!.subject).toBe("hello");
});
