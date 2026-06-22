import { randomUUID } from "node:crypto";

// The shared audit contract. Emitters construct an
// AuditEvent; buildEnvelope enriches it into the wire/storage Envelope (stable
// id = the dedup key, occurred-at, source, defaults). The Envelope is what the
// outbox stores and the relay inserts into audit_log.

export type AuditOutcome = "success" | "failure" | "unknown";

export interface AuditActor {
  type: string; // user | service | system | apikey
  id: string;
}

export interface AuditEvent {
  action: string; // dotted "<domain>.<object>.<verb>"
  outcome?: AuditOutcome; // defaults to "success"
  actor?: AuditActor;
  tenantId?: string;
  targetType?: string;
  targetId?: string;
  sessionId?: string;
  traceId?: string;
  ipHash?: Uint8Array;
  userAgent?: string;
  meta?: Record<string, unknown>; // slice detail — never PII/secrets/tokens
}

export interface AuditEnvelope {
  id: string; // stable per-event id; the audit_log dedup key (message_id)
  occurredAt: Date;
  source: string; // emitting service, e.g. "auth"
  tenantId?: string;
  action: string;
  outcome: string;
  actorType: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  sessionId?: string;
  traceId?: string;
  ipHash?: string; // base64 (the envelope is JSON in the outbox payload; decoded to bytea at insert)
  userAgent?: string;
  meta?: Record<string, unknown>;
}

// Auditor is the single dependency services take to emit audit events. record
// logs-and-continues; recordSync returns the error so a same-transaction caller
// can roll back when the audit write must be durable (ports audit.Auditor).
export interface Auditor {
  record(event: AuditEvent): Promise<void>;
  recordSync(event: AuditEvent): Promise<void>;
}

export function buildEnvelope(e: AuditEvent, source: string): AuditEnvelope {
  return {
    id: randomUUID(),
    occurredAt: new Date(),
    source,
    tenantId: e.tenantId || undefined,
    action: e.action,
    outcome: e.outcome ?? "success",
    actorType: e.actor?.type ?? "system",
    actorId: e.actor?.id,
    targetType: e.targetType,
    targetId: e.targetId,
    sessionId: e.sessionId,
    traceId: e.traceId,
    ipHash: e.ipHash ? Buffer.from(e.ipHash).toString("base64") : undefined,
    userAgent: e.userAgent,
    meta: e.meta,
  };
}
