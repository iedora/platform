import { type ColumnType, type Generated, type Selectable } from "kysely"

// Insert-optional (DB default), never updated (append-only).
type OccurredAt = ColumnType<Date, Date | string | undefined, never>
// jsonb: pass the object/array on write — never a pre-stringified string (that
// double-encodes under kysely-postgres-js/Bun SQL).
type Json = ColumnType<Record<string, unknown> | null, Record<string, unknown> | null, never>

/** One immutable audit event about any entity. `oldData`/`newData` capture the
 *  before/after state; `changedFields` is the set of keys that differ. */
export interface AuditLogTable {
  id: Generated<string>
  tenantId: string | null
  /** The service/component that emitted the event, when audit is aggregated from
   *  several producers into one log (e.g. "billing", "auth"). Null for a
   *  single-emitter deployment. */
  source: string | null
  /** When the audited action happened (partition key). */
  occurredAt: OccurredAt
  /** "user" | "service" | "system" | … */
  actorType: string | null
  actorId: string | null
  /** Dotted verb, e.g. "user.updated", "auth.session.started". */
  action: string
  /** The audited entity, e.g. "user" / "<uuid>". */
  entityType: string | null
  entityId: string | null
  outcome: Generated<string>
  oldData: Json
  newData: Json
  // jsonb (not text[]): JS arrays don't round-trip cleanly through the Bun SQL /
  // kysely-postgres-js driver ("malformed array literal"); jsonb does.
  changedFields: ColumnType<string[] | null, string[] | null, never>
  metadata: ColumnType<Record<string, unknown>, Record<string, unknown> | undefined, never>
  ip: string | null
  userAgent: string | null
}

export interface AuditLogDB {
  auditLog: AuditLogTable
}

export type AuditRecord = Selectable<AuditLogTable>

// NOTE: the audit_log table (append-only, monthly RANGE partitions, BRIN on
// occurred_at) is created by migrations/0001_init.sql — the source of truth,
// applied by runMigrations. The Kysely up()/down() that used to live here were
// dead duplication and were removed.
