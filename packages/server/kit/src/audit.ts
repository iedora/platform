import type { AuditEvent as AuditPayload } from "@iedora/audit";

// Menu's audit EMITTER contract. Services still call auditor.record({ action,
// target, session, trace, meta, ... }); buildEnvelope maps that to an
// @iedora/audit event payload (the sink now IS @iedora/audit). Menu's
// action-log fields that @iedora/audit keeps in metadata (session/trace) are
// folded there; `target` maps to `entity`.

export type AuditOutcome = "success" | "failure" | "unknown";

export interface AuditActor {
  type: string; // user | service | system | apikey
  id: string;
}

export interface AuditEvent {
  action: string; // dotted "<domain>.<object>.<verb>"
  outcome?: AuditOutcome;
  actor?: AuditActor;
  tenantId?: string;
  targetType?: string;
  targetId?: string;
  sessionId?: string;
  traceId?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>; // slice detail — never PII/secrets/tokens
}

// Auditor is the single dependency services take to emit audit events. record
// logs-and-continues; recordSync surfaces the error so a same-transaction caller
// can roll back when the write must be durable.
export interface Auditor {
  record(event: AuditEvent): Promise<void>;
  recordSync(event: AuditEvent): Promise<void>;
}

/** Map a menu emitter event to an @iedora/audit event payload. `target` → entity;
 *  session/trace fold into metadata (kept as metadata keys, queried via
 *  metadata->>'session_id'). occurredAt captures emit time. */
export function buildEnvelope(e: AuditEvent, source: string): AuditPayload {
  const metadata: Record<string, unknown> = { ...(e.meta ?? {}) };
  if (e.sessionId) metadata.session_id = e.sessionId;
  if (e.traceId) metadata.trace_id = e.traceId;
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
  };
}
