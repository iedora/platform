import { createAuditIngester } from "@iedora/audit";
import { createDispatcher, createInbox, enqueue, type Handler } from "@iedora/messaging";
import type { Kysely } from "kysely";

import { type AuditEvent, type Auditor, buildEnvelope } from "./audit";
import type { Database } from "./db";
import type { EmailMessage, Mailer } from "./mailer";

// Transactional outbox, now backed by @iedora/messaging (topic-based
// outbox_message + dispatcher, plugin-agnostic). This module keeps the same
// class surface services already wire (OutboxWriter / OutboxMailer /
// OutboxRelay / relayHandlers) so nothing downstream changes; only the storage
// moved from the bespoke single `outbox` table to @iedora/messaging's
// outbox_message. Menu's audit stays an ACTION event log (its own model) carried
// as the topic payload — @iedora/messaging is transport, not the audit model.

const AUDIT_TOPIC = "audit.events";
const EMAIL_TOPIC = "email.send";

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

/** A {@link Mailer} whose `send` ENQUEUES the email into the same outbox (and the
 *  caller's transaction) instead of delivering it, so a request enqueues the
 *  email atomically with its business change and the relay delivers it later. */
export class OutboxMailer<DB> implements Mailer {
  constructor(private readonly database: Database<DB>) {}

  async send(msg: EmailMessage): Promise<void> {
    await enqueue(this.database.db as unknown as Kysely<unknown>, {
      topic: EMAIL_TOPIC,
      payload: msg as unknown as Record<string, unknown>,
    });
  }
}

/** The relay handler set: audit always; email only when a transport is given.
 *  The audit handler is @iedora/audit's ingester, which dedupes through
 *  @iedora/messaging's inbox (in the audit DB) so the dispatcher's at-least-once
 *  redelivery records each event exactly once. */
export function relayHandlers(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audit: Kysely<any>;
  mailer?: Mailer;
}): Record<string, Handler> {
  const handlers: Record<string, Handler> = {
    [AUDIT_TOPIC]: createAuditIngester(createInbox(opts.audit)),
  };
  if (opts.mailer) {
    const mailer = opts.mailer;
    handlers[EMAIL_TOPIC] = (msg) => mailer.send(msg.payload as unknown as EmailMessage);
  }
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
