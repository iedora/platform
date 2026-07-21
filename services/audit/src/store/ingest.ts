import type { DeliveredMessage, Handler, Inbox } from "@iedora/messaging"
import type { Kysely } from "kysely"

import { type AuditEvent, record } from "./record.ts"
import type { AuditLogDB } from "./schema.ts"

/** Map a delivered outbox message's payload to an audit event. Accepts the rich
 *  shape directly, and falls back to a legacy `{ type, data }` payload
 *  (action = type, metadata = data) so existing emitters keep working. */
export function eventFromPayload(payload: Record<string, unknown>): AuditEvent {
  const p = payload as Record<string, unknown>
  return {
    tenantId: (p.tenantId as string) ?? null,
    source: (p.source as string) ?? null,
    actorType: (p.actorType as string) ?? null,
    actorId: (p.actorId as string) ?? null,
    action: String(p.action ?? p.type ?? "unknown"),
    entityType: (p.entityType as string) ?? null,
    entityId: (p.entityId as string) ?? null,
    outcome: (p.outcome as string) ?? "success",
    // Leave old/new undefined (not null) when absent, so changed_fields stays
    // null for events with no before/after state.
    oldData: (p.oldData as Record<string, unknown>) ?? undefined,
    newData: (p.newData as Record<string, unknown>) ?? undefined,
    metadata: (p.metadata as Record<string, unknown>) ?? (p.data as Record<string, unknown>) ?? {},
    ip: (p.ip as string) ?? null,
    userAgent: (p.userAgent as string) ?? null,
    // Preserve the emitter's event time (serialized to an ISO string in the
    // outbox payload); falls back to now() at record when absent.
    ...(p.occurredAt ? { occurredAt: new Date(p.occurredAt as string) } : {}),
  }
}

/**
 * A @iedora/messaging dispatcher handler that persists audit events. Delivery is
 * at-least-once, so it dedupes through the inbox: the event is recorded exactly
 * once per outbox message, in one transaction with the dedup mark. The inbox's
 * database must also have the audit table. Register it for your audit topic
 * (e.g. `handlers: { audit: createAuditIngester(inbox) }`).
 */
export function createAuditIngester(inbox: Inbox): Handler {
  return async (msg: DeliveredMessage): Promise<void> => {
    await inbox.handleOnce({ messageId: msg.id, topic: msg.topic }, async (trx) => {
      await record(trx as unknown as Kysely<AuditLogDB>, eventFromPayload(msg.payload))
    })
  }
}
