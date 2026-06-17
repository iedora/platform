import { auditFilter } from "@iedora/contracts";
import type { Database, ServiceVerifier } from "@iedora/server-kit";
import { serviceAuth } from "@iedora/server-kit";
import { Hono } from "hono";

import type { AuditDB } from "./schema";
import { queryAudit } from "./store";

export interface AuditDeps {
  database: Database<AuditDB>;
  verifier: ServiceVerifier;
}

// buildApp constructs the audit service's Hono app: a /up liveness probe and the
// service-token-gated read API GET /obs/events (keyset query over audit_log).
// Exported (with its type) so the admin BFF can build a typed Hono RPC client.
export function buildApp(deps: AuditDeps) {
  const app = new Hono();

  app.get("/up", async (c) => {
    try {
      await deps.database.ping();
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  app.get("/obs/events", serviceAuth(deps.verifier), async (c) => {
    const parsed = auditFilter.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "invalid query" }, 400);
    return c.json(await queryAudit(deps.database.db, parsed.data));
  });

  return app;
}

export type AuditApp = ReturnType<typeof buildApp>;
