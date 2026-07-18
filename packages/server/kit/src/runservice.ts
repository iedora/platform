import type { Hono } from "hono";

import type { Auditor } from "./audit";
import { serve } from "@iedora/service-kit";
import type { Database } from "@iedora/service-kit";
import type { Mailer } from "./mailer";
import { type AuditSink, OutboxRelay, OutboxWriter, relayHandlers } from "./outbox";

export interface RelayServiceOptions<DB> {
  name: string; // service name for logs (e.g. "iedora-auth")
  port: number;
  source: string; // OutboxWriter tag (the emitting service, e.g. "auth")
  db: Database<DB>; // the service's primary DB (also where its outbox lives)
  /** HTTP sink to the audit service. HARD RULE: producers never touch the audit
   *  DB — the relay POSTs events to the audit service, which owns its schema. */
  audit: AuditSink;
  /** Optional email transport. When given, the relay also delivers `email.send`
   *  outbox rows (enqueued via OutboxMailer) through it. */
  mailer?: Mailer;
  /** Builds the app, given the auditor wired to this service's outbox. An
   * RPC-typed app carries its route schema in the generics, so accept any. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (ctx: { auditor: Auditor }) => Hono<any, any, any>;
}

/**
 * Boots a producer service that emits audit events: it owns the OutboxWriter,
 * the background OutboxRelay (which delivers to the audit service over HTTP), and
 * the graceful-shutdown order (stop relay, then close primary). Centralizing this
 * removes the hand-copied lifecycle from every index.ts and the risk of an
 * inconsistent shutdown sequence. The service's own deps (verifiers, clients,
 * the audit sink) are constructed by the caller and closed over in `build`.
 */
export function runRelayService<DB>(opts: RelayServiceOptions<DB>): void {
  const auditor = new OutboxWriter(opts.db, opts.source);
  const relay = new OutboxRelay(opts.db, relayHandlers({ audit: opts.audit, mailer: opts.mailer }));
  relay.start();

  serve(opts.build({ auditor }), {
    name: opts.name,
    port: opts.port,
    onShutdown: async () => {
      await relay.stop();
      await opts.db.close();
    },
  });
}
