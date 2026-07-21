import type { AuditEvent } from "./types"

/**
 * The wire payload an audit event is enqueued/POSTed as — the rich key shape the
 * audit service's ingester reads (`eventFromPayload`). Redeclared here (not
 * imported from @iedora/audit) so the SDK stays dependency-free. `occurredAt`
 * serializes to an ISO string over the wire and is revived on ingest.
 */
export interface AuditEnvelope {
  tenantId: string | null
  source: string
  actorType: string
  actorId: string | null
  action: string
  entityType: string | null
  entityId: string | null
  outcome: string
  metadata: Record<string, unknown>
  ip: string | null
  userAgent: string | null
  occurredAt: Date
}

/**
 * Map an emitter {@link AuditEvent} to the audit service's wire payload. `target`
 * becomes `entity`; `session`/`trace` fold into `metadata` (queried via
 * `metadata->>'session_id'`). `source` identifies the emitting service.
 * `occurredAt` captures emit time.
 */
export function buildEnvelope(e: AuditEvent, source: string): AuditEnvelope {
  const metadata: Record<string, unknown> = { ...e.meta }
  if (e.sessionId) metadata.session_id = e.sessionId
  if (e.traceId) metadata.trace_id = e.traceId
  return {
    tenantId: e.tenantId || null,
    source,
    actorType: e.actor?.type ?? "system",
    actorId: e.actor?.id ?? null,
    action: e.action,
    entityType: e.targetType ?? null,
    entityId: e.targetId ?? null,
    outcome: e.outcome ?? "success",
    metadata,
    ip: e.ip || null,
    userAgent: e.userAgent ?? null,
    occurredAt: new Date(),
  }
}
