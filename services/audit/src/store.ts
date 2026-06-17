import type { AuditFilter, AuditQueryResponse, AuditRecord } from "@iedora/contracts";
import { type Kysely, sql } from "kysely";

import type { AuditDB } from "./schema";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(n: number | undefined): number {
  return n && n > 0 && n <= MAX_LIMIT ? n : DEFAULT_LIMIT;
}

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

// queryAudit returns audit records newest-first using keyset pagination on
// (at, id) — a verbatim port of the Go internal/auditserver/store.go Query.
export async function queryAudit(db: Kysely<AuditDB>, f: AuditFilter): Promise<AuditQueryResponse> {
  const limit = clampLimit(f.limit);

  let q = db
    .selectFrom("audit_log")
    .select([
      "id",
      "at",
      "source",
      "tenant_id",
      "action",
      "outcome",
      "actor_type",
      "actor_id",
      "target_type",
      "target_id",
      "session_id",
      "trace_id",
      "meta",
    ]);

  if (f.tenant) q = q.where("tenant_id", "=", f.tenant);
  if (f.actor) q = q.where("actor_id", "=", f.actor);
  if (f.action) q = q.where("action", "like", `${f.action}%`); // prefix match
  if (f.outcome) q = q.where("outcome", "=", f.outcome);
  if (f.source) q = q.where("source", "=", f.source);
  if (f.before_at && f.before_id) {
    q = q.where(sql<boolean>`(at, id) < (${f.before_at}::timestamptz, ${f.before_id}::uuid)`);
  }

  const rows = await q.orderBy("at", "desc").orderBy("id", "desc").limit(limit).execute();

  const events: AuditRecord[] = rows.map((r) => ({
    id: r.id,
    at: iso(r.at),
    source: r.source,
    tenantId: r.tenant_id ?? undefined,
    action: r.action,
    outcome: r.outcome,
    actorType: r.actor_type,
    actorId: r.actor_id ?? undefined,
    targetType: r.target_type ?? undefined,
    targetId: r.target_id ?? undefined,
    sessionId: r.session_id ?? undefined,
    traceId: r.trace_id ?? undefined,
    meta: r.meta ?? {},
  }));

  const resp: AuditQueryResponse = { events };
  if (events.length === limit && rows.length > 0) {
    const last = rows[rows.length - 1]!;
    resp.next = { at: iso(last.at), id: last.id };
  }
  return resp;
}
