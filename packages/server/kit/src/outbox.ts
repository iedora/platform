import { createDispatcher, enqueue, type Handler } from "@iedora/messaging";
import { ServiceClient } from "@iedora/server-kit";
import type { Kysely } from "kysely";

import { type AuditEvent, type Auditor, buildEnvelope } from "./audit";
import type { Database } from "@iedora/service-kit";
import type { EmailSink } from "@iedora/email-sdk";
import type { EmailMessage } from "./mailer";

// Transactional outbox, now backed by @iedora/messaging (topic-based
// outbox_message + dispatcher, plugin-agnostic). This module keeps the same
// class surface services already wire (OutboxWriter / OutboxMailer /
// OutboxRelay / relayHandlers) so nothing downstream changes; only the storage
// moved from the bespoke single `outbox` table to @iedora/messaging's
// outbox_message. Menu's audit stays an ACTION event log (its own model) carried
// as the topic payload — @iedora/messaging is transport, not the audit model.

export const AUDIT_TOPIC = "audit.events";
const EMAIL_TOPIC = "email.send";

/** A delivered audit envelope + its idempotency key (the outbox message id). */
export interface AuditDelivery {
  messageId: string;
  payload: Record<string, unknown>;
}

/** Where the relay delivers audit events. HARD RULE: a producer never writes the
 *  audit service's tables through the DB — it POSTs events over HTTP and the
 *  audit service records them into its own schema. So this is an HTTP sink, not
 *  a Kysely handle. */
export interface AuditSink {
  ingest(events: AuditDelivery[]): Promise<void>;
}

/** AuditSink over HTTP: posts a batch to the audit service's `POST /events`. The
 *  messageId is the idempotency key — the audit service dedupes on it (its own
 *  inbox), so the outbox's at-least-once redelivery records each event once. */
export class AuditClient implements AuditSink {
  constructor(private readonly svc: ServiceClient) {}
  async ingest(events: AuditDelivery[]): Promise<void> {
    if (events.length === 0) return;
    await this.svc.post("/events", { events });
  }
}

/** Records audit events into the producer's own outbox within the caller's
 *  transaction (Database.db = active tx or pool), so the event is durable
 *  exactly when the business change commits. */
export class OutboxWriter<DB> implements Auditor {
  constructor(
    private readonly database: Database<DB>,
    private readonly source: string,
  ) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.write(event);
    } catch (err) {
      console.error(
        JSON.stringify({ level: "error", msg: "outbox write failed", action: event.action, err: String(err) }),
      );
    }
  }

  recordSync(event: AuditEvent): Promise<void> {
    return this.write(event);
  }

  private async write(event: AuditEvent): Promise<void> {
    const envelope = buildEnvelope(event, this.source);
    // Enqueue the raw envelope object (jsonb). occurredAt serializes to an ISO
    // string and is revived on delivery.
    await enqueue(this.database.db as unknown as Kysely<unknown>, {
      topic: AUDIT_TOPIC,
      payload: envelope as unknown as Record<string, unknown>,
    });
  }
}

/** ENQUEUES an email into the same outbox (and the caller's transaction) instead
 *  of delivering it — so a request enqueues the email atomically with its business
 *  change and the relay delivers it later via @iedora/email's handler. The enqueue
 *  side isn't an @iedora/email Mailer (no SMTP transport); it just needs `send`. */
export class OutboxMailer<DB> {
  constructor(private readonly database: Database<DB>) {}

  async send(msg: EmailMessage): Promise<void> {
    await enqueue(this.database.db as unknown as Kysely<unknown>, {
      topic: EMAIL_TOPIC,
      payload: msg as unknown as Record<string, unknown>,
    });
  }
}

/** The relay handler set: audit always; email only when a transport is given.
 *  The audit handler POSTs each event to the audit service via the AuditSink;
 *  a delivery failure throws, so the dispatcher retries (at-least-once) and the
 *  audit service's inbox makes the eventual record exactly-once. */
export function relayHandlers(opts: {
  audit: AuditSink;
  email?: EmailSink;
}): Record<string, Handler> {
  const handlers: Record<string, Handler> = {
    [AUDIT_TOPIC]: (msg) => opts.audit.ingest([{ messageId: msg.id, payload: msg.payload }]),
  };
  // Email is a generic microservice reached over the SDK: the relay POSTs each
  // queued message to the email service, which delivers it via SMTP. The message
  // id is the idempotency key the service dedupes on.
  if (opts.email) handlers[EMAIL_TOPIC] = (msg) => opts.email!.deliver([{ messageId: msg.id, payload: msg.payload }]);
  return handlers;
}

interface RelayOptions {
  intervalMs?: number;
  batch?: number;
}

/** Drains the producer's outbox_message, dispatching each row to its topic's
 *  handler via @iedora/messaging. Thin wrapper preserving the previous
 *  start/stop/drainOnce surface. */
export class OutboxRelay<DB> {
  private readonly dispatcher: ReturnType<typeof createDispatcher>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;

  constructor(
    src: Database<DB>,
    handlers: Record<string, Handler>,
    opts: RelayOptions = {},
  ) {
    this.intervalMs = opts.intervalMs ?? 1000;
    this.dispatcher = createDispatcher(src.root as unknown as Kysely<unknown>, {
      handlers,
      batchSize: opts.batch ?? 100,
    });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.drainOnce(), this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Drain until no rows remain this pass; returns rows published. */
  async drainOnce(): Promise<number> {
    let total = 0;
    for (;;) {
      const n = await this.dispatcher.tick();
      total += n;
      if (n === 0) break;
    }
    return total;
  }
}
