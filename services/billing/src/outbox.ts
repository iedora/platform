import {
  type AuditDelivery,
  type AuditEvent,
  type AuditSink,
  type Auditor,
  AUDIT_TOPIC,
  buildEnvelope,
} from "@iedora/sdk/audit"
import { type EmailSink, EMAIL_TOPIC } from "@iedora/sdk/email"
import { createDispatcher, enqueue, type Handler } from "@iedora/messaging"
import { type Database, serve } from "@iedora/service-kit"
import type { Hono } from "hono"
import type { Kysely } from "kysely"

// Billing's own transactional outbox + relay, composed directly on the framework
// (@iedora/messaging transport + @iedora/sdk/audit / @iedora/sdk/email HTTP
// sinks). No shared server kit: the framework IS the shared surface, and each
// service owns its outbox/relay. Producers never write another service's DB —
// audit/email cross the wire as HTTP; the message id is the idempotency key the
// sink service dedupes on, so at-least-once redelivery lands exactly once.

/** Records audit events into billing's own outbox within the caller's
 *  transaction (Database.db = active tx or pool), so the event is durable
 *  exactly when the business change commits. */
export class OutboxWriter<DB> implements Auditor {
  constructor(
    private readonly database: Database<DB>,
    private readonly source: string,
  ) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.write(event)
    } catch (err) {
      console.error(
        JSON.stringify({ level: "error", msg: "outbox write failed", action: event.action, err: String(err) }),
      )
    }
  }

  recordSync(event: AuditEvent): Promise<void> {
    return this.write(event)
  }

  private async write(event: AuditEvent): Promise<void> {
    const envelope = buildEnvelope(event, this.source)
    await enqueue(this.database.db as unknown as Kysely<unknown>, {
      topic: AUDIT_TOPIC,
      payload: envelope as unknown as Record<string, unknown>,
    })
  }
}

/** The relay handler set: audit always; email only when a sink is given. Each
 *  handler POSTs the batch to the owning service; a failure throws, so the
 *  dispatcher retries and the sink's inbox makes the eventual write exactly-once. */
export function relayHandlers(opts: { audit: AuditSink; email?: EmailSink }): Record<string, Handler> {
  const handlers: Record<string, Handler> = {
    [AUDIT_TOPIC]: (msg) =>
      opts.audit.ingest([{ messageId: msg.id, payload: msg.payload } satisfies AuditDelivery]),
  }
  if (opts.email) {
    handlers[EMAIL_TOPIC] = (msg) => opts.email!.deliver([{ messageId: msg.id, payload: msg.payload }])
  }
  return handlers
}

/** Drains billing's outbox_message, dispatching each row to its topic's handler. */
export class OutboxRelay<DB> {
  private readonly dispatcher: ReturnType<typeof createDispatcher>
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly intervalMs: number

  constructor(src: Database<DB>, handlers: Record<string, Handler>, opts: { intervalMs?: number; batch?: number } = {}) {
    this.intervalMs = opts.intervalMs ?? 1000
    this.dispatcher = createDispatcher(src.root as unknown as Kysely<unknown>, {
      handlers,
      batchSize: opts.batch ?? 100,
    })
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.drainOnce(), this.intervalMs)
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Drain until no rows remain this pass; returns rows published. */
  async drainOnce(): Promise<number> {
    let total = 0
    for (;;) {
      const n = await this.dispatcher.tick()
      total += n
      if (n === 0) break
    }
    return total
  }
}

export interface RelayServiceOptions<DB> {
  name: string
  port: number
  source: string
  db: Database<DB>
  audit: AuditSink
  email?: EmailSink
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (ctx: { auditor: Auditor }) => Hono<any, any, any>
}

/**
 * Boots billing as a producer: owns the OutboxWriter, the background OutboxRelay
 * (delivering to audit/email over HTTP), and the graceful-shutdown order (stop
 * relay, then close the DB).
 */
export function runRelayService<DB>(opts: RelayServiceOptions<DB>): void {
  const auditor = new OutboxWriter(opts.db, opts.source)
  const relay = new OutboxRelay(opts.db, relayHandlers({ audit: opts.audit, email: opts.email }))
  relay.start()

  serve(opts.build({ auditor }), {
    name: opts.name,
    port: opts.port,
    onShutdown: async () => {
      await relay.stop()
      await opts.db.close()
    },
  })
}
