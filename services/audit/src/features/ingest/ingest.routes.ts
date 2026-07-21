import { createAuditIngester } from "../../store"
import { createInbox } from "@iedora/messaging"
import { type ServiceEnv, serviceAuth } from "@iedora/service-kit"
import { Hono } from "hono"
import { z } from "zod"

import type { AuditDeps } from "../../deps"

// Vertical slice: INGESTING audit events. Producers never write audit_log
// through the DB (hard rule: services don't communicate through the database) —
// each producer's outbox relay POSTs its events here over a service token, and
// this slice records them into the audit service's OWN schema, deduped by the
// producer's outbox message id so at-least-once redelivery records once.
const ingestBody = z.object({
  events: z
    .array(
      z.object({
        messageId: z.string().min(1),
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1),
})

export function ingestRoutes(deps: AuditDeps) {
  // Built once over the audit service's own pool; the inbox dedupes each event
  // by messageId and records into audit_log in one transaction.
  const ingest = createAuditIngester(createInbox(deps.database.root))
  // Body validated in-handler (not via zValidator): this route has no typed RPC
  // client, and threading the array/record schema through Hono's generics blows
  // the type-instantiation depth.
  // allowReadonly: a read-only console (Vantage) still needs to log its own
  // reads by POSTing view events here — that's a safe write, so it's exempt from
  // the read-only non-GET refusal.
  return new Hono<ServiceEnv>().post("/events", serviceAuth(deps.verifier, { allowReadonly: true }), async (c) => {
    const parsed = ingestBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400)
    for (const e of parsed.data.events) {
      await ingest({ id: e.messageId, topic: "audit.events", payload: e.payload, attempts: 0 })
    }
    return c.json({ ok: true, count: parsed.data.events.length })
  })
}
