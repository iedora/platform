/** A source of bearer service tokens (minted from @iedora/auth-sdk). */
export type TokenSource = { token(): Promise<string> }

/** The outbox topic audit events are enqueued under. */
export const AUDIT_TOPIC = "audit.events"

export type AuditOutcome = "success" | "failure" | "unknown"

export interface AuditActor {
  type: string // user | service | system | apikey
  id: string
}

/**
 * The audit EMITTER contract — an action-event (who did what to which entity).
 * Services call `auditor.record({ action, actor, target, ... })`; the audit
 * service maps this to its storage payload. Dotted `action` = "<domain>.<object>.<verb>".
 */
export interface AuditEvent {
  action: string
  outcome?: AuditOutcome
  actor?: AuditActor
  tenantId?: string
  targetType?: string
  targetId?: string
  sessionId?: string
  traceId?: string
  ip?: string
  userAgent?: string
  /** Slice detail — never PII/secrets/tokens. */
  meta?: Record<string, unknown>
}

/**
 * The single dependency a service takes to emit audit events. `record`
 * logs-and-continues; `recordSync` surfaces the error so a same-transaction
 * caller can roll back when the write must be durable.
 */
export interface Auditor {
  record(event: AuditEvent): Promise<void>
  recordSync(event: AuditEvent): Promise<void>
}

/** One delivered outbox row: a stable message id (dedupe key) + the audit event. */
export interface AuditDelivery {
  messageId: string
  payload: Record<string, unknown>
}

/** The transport a producer's relay pushes audit events through. The audit
 *  service NEVER touches producers' DBs — events cross the wire as HTTP. */
export interface AuditSink {
  ingest(events: AuditDelivery[]): Promise<void>
}

// ── read side (GET /obs/events) ──────────────────────────────────────────────
/** A stored audit record as the query API returns it (newest-first). `entity`
 *  maps back to `target`; `session`/`trace` are lifted out of metadata. */
export interface AuditRecord {
  id: string
  at: string // RFC3339
  source: string
  tenantId?: string
  action: string
  outcome: string
  actorType: string
  actorId?: string
  targetType?: string
  targetId?: string
  sessionId?: string
  traceId?: string
  ip?: string
  userAgent?: string
  meta?: unknown
}

/** Query filter + keyset cursor accepted by GET /obs/events. */
export interface AuditFilter {
  tenant?: string
  actor?: string
  action?: string // prefix match
  outcome?: string
  source?: string
  target?: string
  before_at?: string
  before_id?: string
  limit?: number
}

/** A page of audit records + the keyset cursor for the next page. */
export interface AuditQueryResponse {
  events: AuditRecord[]
  next?: { at: string; id: string }
}

/** Thrown by the client on a non-2xx response. */
export class AuditError extends Error {
  constructor(
    public status: number,
    message?: string,
  ) {
    super(message ?? `audit: ${status}`)
    this.name = "AuditError"
  }
}
