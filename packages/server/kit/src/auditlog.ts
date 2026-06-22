import { type Kysely, sql } from "kysely";

import type { AuditEnvelope } from "./audit";

// The single idempotent writer of the append-only audit_log.
// Written via the kysely `sql` tag (the audit DB's Kysely types aren't known
// here), parameterized; a duplicate (message_id, at) is a no-op. Used by the
// outbox relay (and any direct ingester).
export async function insertAuditLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  e: AuditEnvelope,
): Promise<void> {
  await sql`
    INSERT INTO audit_log
      (at, source, tenant_id, action, outcome, actor_type, actor_id,
       target_type, target_id, session_id, trace_id, ip_hash, user_agent, meta, message_id)
    VALUES (
      ${e.occurredAt}, ${e.source}, ${e.tenantId ?? null}, ${e.action}, ${e.outcome},
      ${e.actorType}, ${e.actorId ?? null}, ${e.targetType ?? null}, ${e.targetId ?? null},
      ${e.sessionId ?? null}, ${e.traceId ?? null}, ${e.ipHash ? Buffer.from(e.ipHash, "base64") : null}, ${e.userAgent ?? null},
      ${JSON.stringify(e.meta ?? {})}::jsonb, ${e.id}
    )
    ON CONFLICT (message_id, at) DO NOTHING
  `.execute(db);
}
