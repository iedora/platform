import { iso } from "@iedora/service-kit"
import { type Kysely, sql } from "kysely"

import type { EmailFilter, EmailQueryResponse, EmailRecord } from "../../contracts"
import type { EmailDB } from "../../schema"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function clampLimit(n: number | undefined): number {
  return n && n > 0 && n <= MAX_LIMIT ? n : DEFAULT_LIMIT
}

/** A single successful/failed send to record. `source` is the producer service
 *  (the service-token client id); `messageId` is set for relayed sends. */
export interface DeliveryInput {
  source: string
  tenantId?: string | null
  to: string
  subject: string
  status?: "sent" | "failed"
  error?: string | null
  messageId?: string | null
}

/** Record one delivery. Called by the send slice after the mailer resolves. */
export async function recordDelivery(db: Kysely<EmailDB>, d: DeliveryInput): Promise<void> {
  await db
    .insertInto("email_delivery")
    .values({
      source: d.source,
      tenant_id: d.tenantId ?? null,
      to_addr: d.to,
      subject: d.subject,
      status: d.status ?? "sent",
      error: d.error ?? null,
      message_id: d.messageId ?? null,
    })
    .execute()
}

// queryDeliveries returns the delivery log newest-first with keyset pagination on
// (at, id). id is a bigint identity, so the cursor compares against ::bigint.
export async function queryDeliveries(
  db: Kysely<EmailDB>,
  f: EmailFilter,
): Promise<EmailQueryResponse> {
  const limit = clampLimit(f.limit)

  let q = db
    .selectFrom("email_delivery")
    .select(["id", "at", "source", "tenant_id", "to_addr", "subject", "status", "error", "message_id"])

  if (f.source) q = q.where("source", "=", f.source)
  if (f.status) q = q.where("status", "=", f.status)
  if (f.tenant) q = q.where("tenant_id", "=", f.tenant)
  if (f.to) q = q.where("to_addr", "ilike", `%${f.to}%`)
  if (f.before_at && f.before_id) {
    q = q.where(sql<boolean>`(at, id) < (${f.before_at}::timestamptz, ${f.before_id}::bigint)`)
  }

  const rows = await q.orderBy("at", "desc").orderBy("id", "desc").limit(limit).execute()

  const deliveries: EmailRecord[] = rows.map((r) => ({
    id: String(r.id),
    at: iso(r.at),
    source: r.source,
    tenantId: r.tenant_id ?? undefined,
    to: r.to_addr,
    subject: r.subject,
    status: r.status,
    error: r.error ?? undefined,
    messageId: r.message_id ?? undefined,
  }))

  const resp: EmailQueryResponse = { deliveries }
  if (deliveries.length === limit && rows.length > 0) {
    const last = rows[rows.length - 1]!
    resp.next = { at: iso(last.at), id: String(last.id) }
  }
  return resp
}
