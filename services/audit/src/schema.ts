import type { Generated } from "kysely";

// Kysely table types for the audit database. Hand-written for the pilot;
// kysely-codegen will generate these from the live schema in a later step.
// Mirrors migrations/0001_init.sql.

export interface AuditLogTable {
  id: Generated<string>;
  at: Generated<Date>;
  source: Generated<string>;
  tenant_id: string | null;
  action: string;
  outcome: Generated<string>;
  actor_type: Generated<string>;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  session_id: string | null;
  trace_id: string | null;
  ip_hash: Uint8Array | null;
  user_agent: string | null;
  meta: Generated<unknown>;
  schema_version: Generated<number>;
  message_id: string | null;
}

export interface AuditDB {
  audit_log: AuditLogTable;
}
