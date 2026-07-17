import type { Hono } from "hono";

import type { Auditor } from "./audit";
import { serve } from "./boot";
import { Database } from "./db";
import type { Mailer } from "./mailer";
import { OutboxRelay, OutboxWriter, relayHandlers } from "./outbox";

export interface RelayServiceOptions<DB> {
  name: string; // service name for logs (e.g. "iedora-auth")
  port: number;
  source: string; // OutboxWriter tag (the emitting service, e.g. "auth")
  db: Database<DB>; // the service's primary DB (also where its outbox lives)
  auditDatabaseUrl: string; // the audit DB the relay drains the outbox into
  /** Schema of the audit sink in a shared DB (search_path). Default "audit".
   *  Set to "" when the audit service runs on its own database. */
  auditSchema?: string;
  /** Optional email transport. When given, the relay also delivers `email.send`
   *  outbox rows (enqueued via OutboxMailer) through it. */
  mailer?: Mailer;
  /** Builds the app, given the auditor wired to this service's outbox. An
   * RPC-typed app carries its route schema in the generics, so accept any. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (ctx: { auditor: Auditor }) => Hono<any, any, any>;
}

/**
 * Boots a producer service that emits audit events: it owns the audit-DB handle,
 * the OutboxWriter, the background OutboxRelay, and the graceful-shutdown order
 * (stop relay → close primary → close audit DB). Centralizing this removes the
 * hand-copied lifecycle from every index.ts and the risk of an inconsistent
 * shutdown sequence. The service's own deps (verifiers, clients) are constructed
 * by the caller and closed over in `build`.
 */
export function runRelayService<DB>(opts: RelayServiceOptions<DB>): void {
  // relay is low-volume; the audit sink is a schema of the shared DB by default.
  const auditDb = new Database(opts.auditDatabaseUrl, {
    poolMax: 4,
    schema: opts.auditSchema === undefined ? "audit" : opts.auditSchema || undefined,
  });
  const auditor = new OutboxWriter(opts.db, opts.source);
  const relay = new OutboxRelay(opts.db, relayHandlers({ audit: auditDb.root, mailer: opts.mailer }));
  relay.start();

  serve(opts.build({ auditor }), {
    name: opts.name,
    port: opts.port,
    onShutdown: async () => {
      await relay.stop();
      await opts.db.close();
      await auditDb.close();
    },
  });
}
