import postgres from "postgres";
import { afterAll, beforeAll, expect, test } from "vitest";

import { up as messagingUp } from "@iedora/messaging";
import {
  type AuditDelivery,
  type AuditSink,
  Database,
  type EmailMessage,
  OutboxMailer,
  OutboxRelay,
  OutboxWriter,
  relayHandlers,
} from "../src/index.ts";

// Bun-runtime integration test against a real Postgres. Provisions ONE throwaway
// producer DB (outbox_message via @iedora/messaging) and drives the relay against
// capture sinks. Audit + email are generic microservices reached over their SDKs;
// their real ingestion/delivery is tested in the service repos, so here we assert
// only that the producer relay drains the outbox and POSTs each row to its sink.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://iedora:iedora@localhost:55433/postgres";

const tag = `${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
const producerName = `outbox_src_${tag}`;

function urlFor(db: string): string {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${db}`;
  return u.toString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let producer: Database<any>;

beforeAll(async () => {
  const admin = postgres(ADMIN_URL);
  await admin.unsafe(`CREATE DATABASE "${producerName}"`);
  await admin.end();

  producer = new Database(urlFor(producerName));
  // Producer gets @iedora/messaging's outbox_message + inbox_message.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await messagingUp(producer.root as any);
});

afterAll(async () => {
  await producer?.close();
  const admin = postgres(ADMIN_URL);
  await admin
    .unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [producerName])
    .catch(() => {});
  await admin.unsafe(`DROP DATABASE IF EXISTS "${producerName}"`).catch(() => {});
  await admin.end();
});

/** An AuditSink that captures the events the relay POSTs (stands in for the
 *  audit service's HTTP endpoint). */
function captureAuditSink(): AuditSink & { events: AuditDelivery[] } {
  const events: AuditDelivery[] = [];
  return { events, ingest: async (batch) => void events.push(...batch) };
}

test("writer + relay drain an outbox event and POST it to the audit sink", async () => {
  const writer = new OutboxWriter(producer, "auth");
  await writer.recordSync({
    action: "auth.session.login",
    outcome: "success",
    actor: { type: "user", id: "u-1" },
  });

  const sink = captureAuditSink();
  const relay = new OutboxRelay(producer, relayHandlers({ audit: sink }));
  const published = await relay.drainOnce();
  expect(published).toBe(1);
  expect(sink.events).toHaveLength(1);
  expect((sink.events[0]!.payload as { action: string }).action).toBe("auth.session.login");

  // outbox_message row marked delivered.
  const sql = postgres(urlFor(producerName));
  const rows = (await sql.unsafe(
    `SELECT delivered_at, dead_at FROM outbox_message`,
  )) as { delivered_at: unknown; dead_at: unknown }[];
  await sql.end();
  expect(rows[0]!.delivered_at).not.toBeNull();
  expect(rows[0]!.dead_at).toBeNull();
});

test("OutboxMailer enqueues; the relay POSTs it to the email sink", async () => {
  const sent: EmailMessage[] = [];
  await new OutboxMailer(producer).send({ to: "u@example.com", subject: "hello", text: "hi", html: "<p>hi</p>" });

  // The relay POSTs each queued email to the email service via the EmailSink
  // (email-sdk `deliver`), so the fake sink captures the delivered payloads.
  const captureSink = {
    deliver: async (msgs: { messageId: string; payload: Record<string, unknown> }[]) =>
      void msgs.forEach((m) => sent.push(m.payload as unknown as EmailMessage)),
  };
  const relay = new OutboxRelay(producer, relayHandlers({ audit: captureAuditSink(), email: captureSink }));
  await relay.drainOnce();

  expect(sent).toHaveLength(1);
  expect(sent[0]!.to).toBe("u@example.com");
  expect(sent[0]!.subject).toBe("hello");
});
