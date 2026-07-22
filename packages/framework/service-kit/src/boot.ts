import { serve as nodeServe } from "@hono/node-server";
import type { Hono } from "hono";

import { emitLog, initOtel, shutdownOtel } from "./otel.ts";

/**
 * A background lifecycle started after the server is listening and stopped
 * before shutdown. `@iedora/jobs`' runner satisfies this structurally, so
 * adopting jobs in a service is just `serve(app, { workers: [jobs] })` — no
 * per-service start/stop wiring. Kept structural so service-kit needn't depend
 * on any particular worker package.
 */
export interface Worker {
  start(): void;
  stop(): Promise<void>;
}

export interface ServeOptions {
  name: string;
  port: number;
  shutdownTimeoutMs?: number;
  /** Background workers (e.g. a job runner) started after listen, stopped on shutdown. */
  workers?: readonly Worker[];
  /** Cleanup run during graceful shutdown — stop relays, close DB pools, etc. */
  onShutdown?: () => Promise<void> | void;
}

/**
 * serve starts a Hono app on the Node HTTP server (@hono/node-server) and wires
 * SIGTERM/SIGINT graceful shutdown: stop accepting connections + drain in-flight
 * requests, run onShutdown, then exit — bounded by a hard timeout. Node is the
 * production runtime; @hono/node-server runs on Node (and on Bun via node:http).
 * Accepts any Hono regardless of its Env/Schema generics (an RPC-typed app
 * carries a route schema in its type).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serve(app: Hono<any, any, any>, opts: ServeOptions) {
  initOtel(opts.name); // OTel for this service; no-ops in tests / when unconfigured

  const server = nodeServe({ fetch: app.fetch, port: opts.port });
  emitLog("info", "listening", { service: opts.name, port: opts.port });

  for (const worker of opts.workers ?? []) worker.start();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    emitLog("info", "shutting down", { service: opts.name, signal });
    const timer = setTimeout(() => process.exit(1), opts.shutdownTimeoutMs ?? 15_000);
    try {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      // Stop background workers once HTTP is drained, before tearing down shared
      // resources (DB pools) in onShutdown.
      for (const worker of opts.workers ?? []) await worker.stop();
      await opts.onShutdown?.();
      await shutdownOtel(); // flush any buffered spans/metrics before exit
    } finally {
      clearTimeout(timer);
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  return server;
}
