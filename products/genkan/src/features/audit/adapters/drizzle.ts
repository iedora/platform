import 'server-only'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { auditLog, user } from '@/shared/db/schema'
import { db } from '@/shared/db/client'
import {
  AUDIT_CHAIN_LOCK_KEY,
  computeRowHash,
  type AuditChainReader,
  type ChainRow,
} from '../chain'
import type {
  AuditCursor,
  AuditListQuery,
  AuditReader,
  AuditRowInput,
  AuditWriter,
} from '../ports'
import type { AuditLogRow } from '../types'

/**
 * Structural type for any PG-flavoured Drizzle client (postgres-js or
 * pglite). The audit slice doesn't care about the driver — tests pass a
 * PGLite db, production wires postgres-js — so we accept any `PgDatabase`.
 */
type AnyPgDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>

/**
 * Drizzle-backed implementation of the audit ports. One INSERT per
 * `record`, one SELECT with a left-join on `user` per `list`. The writer
 * does NOT swallow errors — the caller is expected to surface a failure
 * to the admin so audit fidelity stays intact.
 *
 * Chain insertion path:
 *
 *   1. BEGIN
 *   2. `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_KEY)` — serialises chain
 *      writers across processes / pods. Released automatically on
 *      COMMIT or ROLLBACK. Other tables are unaffected.
 *   3. `SELECT row_hash FROM audit_log ORDER BY occurred_at DESC, id DESC
 *      LIMIT 1` to read the tail of the chain (NULL on empty table).
 *   4. compute `row_hash` via `computeRowHash`.
 *   5. INSERT row with both fields filled in.
 *   6. COMMIT.
 *
 * Contention is bounded: audit writes are admin-action-frequency
 * (bursts of dozens/sec at the absolute peak), and the critical section
 * is one SELECT + one INSERT.
 */
export function makeDrizzleAuditWriter(database: AnyPgDb): AuditWriter {
  return {
    async record(row: AuditRowInput) {
      await database.transaction(async (tx) => {
        // Serialise chain writers; auto-released on commit / rollback.
        await tx.execute(sql`select pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`)

        const prev = await tx
          .select({ rowHash: auditLog.rowHash })
          .from(auditLog)
          .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
          .limit(1)

        // Chain only links rows that already have a hash. If the tail
        // is an un-backfilled legacy row (rowHash IS NULL) we still
        // treat it as the tail — `prevHash = null` keeps the new row
        // valid; the backfill script will retrofit the legacy run
        // separately. Once backfill has run end-to-end this branch is
        // never hit again.
        const prevHash: string | null = prev[0]?.rowHash ?? null

        const rowHash = computeRowHash({
          prevHash,
          actorId: row.actorId,
          actorRole: row.actorRole,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          payload: row.payload ?? null,
          ip: row.ip,
          userAgent: row.userAgent,
          occurredAt: row.occurredAt,
        })

        await tx.insert(auditLog).values({
          id: row.id,
          actorId: row.actorId,
          actorRole: row.actorRole,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          // Drizzle's pg-jsonb column accepts plain JS values; postgres-js will
          // JSON.stringify them at the wire boundary.
          payload: row.payload ?? null,
          ip: row.ip,
          userAgent: row.userAgent,
          occurredAt: row.occurredAt,
          prevHash,
          rowHash,
        })
      })
    },
  }
}

export const drizzleAuditWriter: AuditWriter = makeDrizzleAuditWriter(db)

export const drizzleAuditReader: AuditReader = {
  async list(query: AuditListQuery) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200)

    // Build the filter conjunction. Each filter is undefined-safe so the
    // composed where stays narrow.
    const conditions = []

    if (query.actorEmail && query.actorEmail.trim().length > 0) {
      conditions.push(ilike(user.email, `%${query.actorEmail.trim()}%`))
    }
    if (query.actions && query.actions.length > 0) {
      conditions.push(inArray(auditLog.action, query.actions))
    }
    if (query.targetType && query.targetType.length > 0) {
      conditions.push(eq(auditLog.targetType, query.targetType))
    }
    if (query.targetId && query.targetId.trim().length > 0) {
      conditions.push(ilike(auditLog.targetId, `%${query.targetId.trim()}%`))
    }
    if (query.since) {
      conditions.push(gte(auditLog.occurredAt, query.since))
    }
    if (query.until) {
      conditions.push(lte(auditLog.occurredAt, query.until))
    }

    // Keyset cursor: WHERE (occurred_at, id) < (cursor.occurredAt, cursor.id)
    // expressed in row-value form so the index on (occurred_at) is usable
    // and ties break deterministically on id.
    if (query.cursor) {
      conditions.push(
        or(
          lt(auditLog.occurredAt, query.cursor.occurredAt),
          and(
            eq(auditLog.occurredAt, query.cursor.occurredAt),
            lt(auditLog.id, query.cursor.id),
          ),
        )!,
      )
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Fetch limit+1 rows: the extra row is consumed to compute the next
    // cursor without re-querying.
    const rows = await db
      .select({
        id: auditLog.id,
        actorId: auditLog.actorId,
        actorRole: auditLog.actorRole,
        actorEmail: user.email,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        payload: auditLog.payload,
        ip: auditLog.ip,
        userAgent: auditLog.userAgent,
        occurredAt: auditLog.occurredAt,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .where(whereClause)
      .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    const nextCursor: AuditCursor | null =
      hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null

    return {
      rows: page.map(
        (r): AuditLogRow => ({
          id: r.id,
          actorId: r.actorId,
          actorRole: r.actorRole,
          actorEmail: r.actorEmail,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          payload: r.payload,
          ip: r.ip,
          userAgent: r.userAgent,
          occurredAt: r.occurredAt,
        }),
      ),
      nextCursor,
    }
  },
}

/**
 * Drizzle-backed implementation of `AuditChainReader`. Walks rows in
 * `(occurred_at asc, id asc)` order — same shape the verifier expects.
 *
 * Keyset cursor: `WHERE (occurred_at, id) > (cursor.occurredAt, cursor.id)`
 * expressed as a disjunction so the existing `occurred_at` index keeps
 * the plan stable on large tables.
 */
export function makeDrizzleChainReader(database: AnyPgDb): AuditChainReader {
  return {
    async readBatch(afterCursor, batchSize) {
      const whereClause = afterCursor
        ? or(
            gt(auditLog.occurredAt, afterCursor.occurredAt),
            and(
              eq(auditLog.occurredAt, afterCursor.occurredAt),
              gt(auditLog.id, afterCursor.id),
            ),
          )
        : undefined

      const rows = await database
        .select({
          id: auditLog.id,
          prevHash: auditLog.prevHash,
          rowHash: auditLog.rowHash,
          actorId: auditLog.actorId,
          actorRole: auditLog.actorRole,
          action: auditLog.action,
          targetType: auditLog.targetType,
          targetId: auditLog.targetId,
          payload: auditLog.payload,
          ip: auditLog.ip,
          userAgent: auditLog.userAgent,
          occurredAt: auditLog.occurredAt,
        })
        .from(auditLog)
        .where(whereClause)
        .orderBy(asc(auditLog.occurredAt), asc(auditLog.id))
        .limit(batchSize)

      return rows.map(
        (r): ChainRow => ({
          id: r.id,
          prevHash: r.prevHash,
          rowHash: r.rowHash,
          actorId: r.actorId,
          actorRole: r.actorRole,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          payload: r.payload,
          ip: r.ip,
          userAgent: r.userAgent,
          occurredAt: r.occurredAt,
        }),
      )
    },
  }
}

export const drizzleAuditChainReader: AuditChainReader = makeDrizzleChainReader(db)

/**
 * Distinct list of `target_type` values currently present in the table.
 * Used by the /admin/audit page to populate the target-type filter without
 * hard-coding the full list (new prefixes added in `types.ts` show up
 * automatically once they've been recorded at least once).
 *
 * Kept small with a hard limit since the cardinality is bounded by the
 * `AuditEvent` union (currently 5 distinct target_types).
 */
export async function listKnownTargetTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ targetType: auditLog.targetType })
    .from(auditLog)
    .where(sql`${auditLog.targetType} IS NOT NULL`)
    .limit(50)
  return rows
    .map((r) => r.targetType)
    .filter((t): t is string => typeof t === 'string')
    .sort()
}
