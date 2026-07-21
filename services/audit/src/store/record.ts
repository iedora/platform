import type { Kysely } from "kysely"

import { changedFields } from "./diff.ts"

/** An audit event about any entity. Only `action` is required; supply
 *  `oldData`/`newData` for change auditing (before/after). */
export type AuditEvent = {
  tenantId?: string | null
  /** Emitting service/component when audit is aggregated from several producers. */
  source?: string | null
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
  /** Defaults to now(); set to backdate an imported event. */
  occurredAt?: Date
}

/**
 * Append an audit event. `changed_fields` is derived from old/new so callers
 * never compute it. Pass the active transaction to record atomically with the
 * change being audited.
 *
 * Plugin-agnostic: uses snake_case identifiers, which are a no-op under
 * CamelCasePlugin and pass through without it — so it works with ANY consuming
 * Kysely regardless of plugin config. jsonb columns are written as raw
 * objects/arrays via the query builder (the dialect serializes them; never
 * JSON.stringify — that double-encodes under kysely-postgres-js/Bun SQL).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function record(exec: Kysely<any>, e: AuditEvent): Promise<void> {
  const changed =
    e.oldData !== undefined || e.newData !== undefined ? changedFields(e.oldData, e.newData) : null
  await exec
    .insertInto("audit_log")
    .values({
      tenant_id: e.tenantId ?? null,
      source: e.source ?? null,
      actor_type: e.actorType ?? null,
      actor_id: e.actorId ?? null,
      action: e.action,
      entity_type: e.entityType ?? null,
      entity_id: e.entityId ?? null,
      outcome: e.outcome ?? "success",
      old_data: e.oldData ?? null,
      new_data: e.newData ?? null,
      changed_fields: changed,
      metadata: e.metadata ?? {},
      ip: e.ip ?? null,
      user_agent: e.userAgent ?? null,
      ...(e.occurredAt ? { occurred_at: e.occurredAt } : {}),
    })
    .execute()
}
