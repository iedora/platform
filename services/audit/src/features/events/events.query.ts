import { iso } from "@iedora/service-kit"
import { type Kysely, sql } from "kysely"

import type { AuditFilter, AuditQueryResponse, AuditRecord } from "../../contracts.ts"
import type { AuditDB } from "../../schema.ts"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function clampLimit(n: number | undefined): number {
  return n && n > 0 && n <= MAX_LIMIT ? n : DEFAULT_LIMIT
}

// queryAudit returns audit records newest-first using keyset pagination on
// (occurred_at, id). The store is @iedora/audit; the action-log API shape is
// preserved by mapping entity_type/id → target and metadata.session_id/trace_id
// → session/trace.
export async function queryAudit(db: Kysely<AuditDB>, f: AuditFilter): Promise<AuditQueryResponse> {
  const limit = clampLimit(f.limit)

  let q = db
    .selectFrom("audit_log")
    .select([
      "id",
      "occurred_at",
      "source",
      "tenant_id",
      "action",
      "outcome",
      "actor_type",
      "actor_id",
      "entity_type",
      "entity_id",
      "ip",
      "user_agent",
      "metadata",
    ])

  if (f.tenant) q = q.where("tenant_id", "=", f.tenant)
  if (f.actor) q = q.where("actor_id", "=", f.actor)
  if (f.action) q = q.where("action", "like", `${f.action}%`) // prefix match
  if (f.outcome) q = q.where("outcome", "=", f.outcome)
  if (f.source) q = q.where("source", "=", f.source)
  if (f.target) q = q.where("entity_id", "=", f.target)
  if (f.before_at && f.before_id) {
    q = q.where(sql<boolean>`(occurred_at, id) < (${f.before_at}::timestamptz, ${f.before_id}::uuid)`)
  }

  const rows = await q.orderBy("occurred_at", "desc").orderBy("id", "desc").limit(limit).execute()

  const events: AuditRecord[] = rows.map((r) => {
    const md = (r.metadata ?? {}) as Record<string, unknown>
    const { session_id, trace_id, ...meta } = md
    return {
      id: r.id,
      at: iso(r.occurred_at),
      source: r.source ?? "unknown",
      tenantId: r.tenant_id ?? undefined,
      action: r.action,
      outcome: r.outcome,
      actorType: r.actor_type ?? "system",
      actorId: r.actor_id ?? undefined,
      targetType: r.entity_type ?? undefined,
      targetId: r.entity_id ?? undefined,
      sessionId: (session_id as string | undefined) ?? undefined,
      traceId: (trace_id as string | undefined) ?? undefined,
      ip: r.ip ?? undefined,
      userAgent: r.user_agent ?? undefined,
      meta,
    }
  })

  const resp: AuditQueryResponse = { events }
  if (events.length === limit && rows.length > 0) {
    const last = rows[rows.length - 1]!
    resp.next = { at: iso(last.occurred_at), id: last.id }
  }
  return resp
}
