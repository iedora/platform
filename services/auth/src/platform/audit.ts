import { type AuditFilter, type AuditRecord, AuditClient } from "@iedora/sdk/audit"
import { type DeliveredMessage, enqueue } from "@iedora/messaging"
import type { Kysely } from "kysely"

import { config } from "./config"
import type { DB } from "./schema"
import { signServiceToken } from "./tokens"

/** An audit event, mirroring the audit service's ingest shape. Enqueued onto the
 *  outbox (topic "audit") and POSTed to the audit service by the relay. */
export type AuditEmit = {
  tenantId?: string | null
  actorType?: string | null
  actorId?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  outcome?: string
  oldData?: Record<string, unknown> | null
  newData?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

// Audit is a generic microservice reached over the SDK: auth mints its own
// service token (it holds the platform signing key) and POSTs events to the
// audit service, which owns the log. Auth never stores audit locally.
const audit = new AuditClient({
  baseUrl: config.auditBaseUrl,
  tokens: {
    token: async () => (await signServiceToken("auth", config.serviceAudience, null)).token,
  },
})

/** Emit an auth event to the audit log. Pass the active transaction to record it
 *  atomically with the change it describes; the relay POSTs it to the service. */
export async function emitAudit(exec: Kysely<DB>, event: AuditEmit): Promise<void> {
  await enqueue(exec, { topic: "audit", payload: { ...event } as Record<string, unknown> })
}

/** Dispatcher handler for the "audit" topic — POSTs each event to the audit
 *  service (deduped there by the outbox message id). */
export const auditHandler = (msg: DeliveredMessage): Promise<void> =>
  audit.ingest([{ messageId: msg.id, payload: msg.payload }])

/** Query the audit log through the service (the admin view). */
export async function queryAudit(filter: AuditFilter): Promise<AuditRecord[]> {
  const { events } = await audit.query(filter)
  return events
}
