import { createHash } from 'node:crypto'

/**
 * Tamper-evident chain helpers for `audit_log`.
 *
 * Each row carries `prev_hash` (the previous row's `row_hash`, NULL on the
 * genesis row) and `row_hash` (sha256 over `prev_hash` plus every stable
 * field of this row). Verification walks rows in chronological order and
 * recomputes; a single byte mutated anywhere breaks the chain at the
 * tampered row and stays broken for every row after.
 *
 * No external dep — sha256 is in Node's `crypto`, and canonical JSON is a
 * 15-line helper below. Adding `json-stable-stringify` would just expand
 * the dependency surface for trivial gain.
 *
 * Field-order contract (do not reorder without a chain rebuild):
 *
 *   prev_hash | actor_id | actor_role | action | target_type | target_id
 *           | canonical(payload) | ip | user_agent | occurred_at(iso ms)
 *
 * Concatenation uses ASCII unit separator `\x1f` (0x1F) between fields.
 * That byte never appears in JSON-encoded payloads or text columns, so
 * injection-via-payload — e.g. embedding `\x1f` in `target_id` to shift a
 * field boundary — is impossible.
 *
 * `id` is intentionally excluded from the hash. The id is a random
 * client-side identifier; a backup/restore that re-generates ids must
 * still validate. The chain links rows by *content*, not identity.
 */

/** Field separator. Unit Separator (US, 0x1F) — control char, never in JSON. */
const SEP = '\x1f'

export interface AuditRowHashInput {
  /** NULL on the genesis row. */
  prevHash: string | null
  actorId: string | null
  actorRole: string | null
  action: string
  targetType: string | null
  targetId: string | null
  /** JS value; canonicalised before hashing. */
  payload: unknown
  ip: string | null
  userAgent: string | null
  /** Serialised as ISO 8601 with millisecond precision. */
  occurredAt: Date
}

/**
 * Compute the chain hash for a single audit-log row. Returns 64 lowercase
 * hex chars (SHA-256). Pure: same input → same output, no I/O.
 *
 * Used by both the production insert path (to fill in `row_hash` before
 * INSERT) and the verifier (to recompute and compare against the stored
 * value).
 */
export function computeRowHash(input: AuditRowHashInput): string {
  const occurredIso =
    input.occurredAt instanceof Date
      ? input.occurredAt.toISOString()
      : new Date(input.occurredAt).toISOString()

  const parts = [
    input.prevHash ?? '',
    input.actorId ?? '',
    input.actorRole ?? '',
    input.action,
    input.targetType ?? '',
    input.targetId ?? '',
    canonicalStringify(input.payload ?? null),
    input.ip ?? '',
    input.userAgent ?? '',
    occurredIso,
  ]

  return createHash('sha256').update(parts.join(SEP)).digest('hex')
}

/**
 * JSON-serialise with object keys sorted lexicographically at every depth.
 * Arrays keep semantic order; primitives behave like `JSON.stringify`.
 *
 * `undefined` is treated as `null` (we never store `undefined`; the
 * payload column is nullable JSONB). Functions / symbols can't occur in
 * an audit payload — if they do `JSON.stringify` already drops them, and
 * we preserve that behaviour for parity with the legacy unhashed rows.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  const t = typeof value
  if (t === 'number' || t === 'boolean') return JSON.stringify(value)
  if (t === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalStringify(v)).join(',') + ']'
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const body = keys
      .map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]))
      .join(',')
    return '{' + body + '}'
  }
  // Unhashable primitive (bigint / symbol / function) — JSON.stringify
  // would either throw or drop. Mirror "drops to null" so the chain
  // doesn't crash on a stray payload.
  return 'null'
}

/**
 * Verification result. On break we surface the FIRST broken row so
 * operators see the tampering point, not the cascade of dependent
 * failures downstream.
 */
export type AuditChainStatus =
  | {
      ok: true
      rowsChecked: number
      latestOccurredAt: Date | null
    }
  | {
      ok: false
      rowsChecked: number
      brokenAtId: string
      brokenAtOccurredAt: Date
      reason: 'hash_mismatch' | 'prev_hash_mismatch' | 'missing_hash'
    }

/**
 * Narrow port the verifier needs — one batched read over rows in
 * chronological order. Decouples the use-case from Drizzle so tests can
 * pass a fake reader.
 */
export interface AuditChainReader {
  /**
   * Read up to `batchSize` rows after `afterId` (or from the start if
   * null), ordered by `(occurred_at asc, id asc)`. Returns the rows in
   * that order.
   */
  readBatch(
    afterCursor: { occurredAt: Date; id: string } | null,
    batchSize: number,
  ): Promise<ChainRow[]>
}

export interface ChainRow {
  id: string
  prevHash: string | null
  rowHash: string | null
  actorId: string | null
  actorRole: string | null
  action: string
  targetType: string | null
  targetId: string | null
  payload: unknown
  ip: string | null
  userAgent: string | null
  occurredAt: Date
}

/**
 * Walk every audit row in chronological order. For each row:
 *
 *   1. assert `row.prevHash === expectedPrevHash` (else `prev_hash_mismatch`:
 *      a row was inserted or deleted between the previous and this one);
 *   2. recompute `computeRowHash(row)`, assert it matches `row.rowHash`
 *      (else `hash_mismatch`: this row was tampered with);
 *   3. advance `expectedPrevHash = row.rowHash`.
 *
 * Stops at the first break so the operator sees the earliest tampering
 * point. Batches at `batchSize` (default 1000) so a 1M-row table doesn't
 * OOM the verifier process.
 */
export async function verifyAuditChain(
  reader: AuditChainReader,
  opts?: { batchSize?: number },
): Promise<AuditChainStatus> {
  const batchSize = opts?.batchSize ?? 1000
  let expectedPrevHash: string | null = null
  let rowsChecked = 0
  let lastOccurredAt: Date | null = null
  let cursor: { occurredAt: Date; id: string } | null = null

  for (;;) {
    const rows: ChainRow[] = await reader.readBatch(cursor, batchSize)
    if (rows.length === 0) break

    for (const row of rows) {
      if (row.rowHash === null) {
        return {
          ok: false,
          rowsChecked,
          brokenAtId: row.id,
          brokenAtOccurredAt: row.occurredAt,
          reason: 'missing_hash',
        }
      }
      if (row.prevHash !== expectedPrevHash) {
        return {
          ok: false,
          rowsChecked,
          brokenAtId: row.id,
          brokenAtOccurredAt: row.occurredAt,
          reason: 'prev_hash_mismatch',
        }
      }
      const computed = computeRowHash({
        prevHash: row.prevHash,
        actorId: row.actorId,
        actorRole: row.actorRole,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        payload: row.payload,
        ip: row.ip,
        userAgent: row.userAgent,
        occurredAt: row.occurredAt,
      })
      if (computed !== row.rowHash) {
        return {
          ok: false,
          rowsChecked,
          brokenAtId: row.id,
          brokenAtOccurredAt: row.occurredAt,
          reason: 'hash_mismatch',
        }
      }
      expectedPrevHash = row.rowHash
      lastOccurredAt = row.occurredAt
      rowsChecked += 1
    }

    const last = rows[rows.length - 1]!
    cursor = { occurredAt: last.occurredAt, id: last.id }
    if (rows.length < batchSize) break
  }

  return { ok: true, rowsChecked, latestOccurredAt: lastOccurredAt }
}

/**
 * Postgres advisory-lock key for chain writers. CRC32 of the ASCII string
 * "audit_log_chain" (computed once, baked in here so a refactor of the
 * key name is an obvious diff). Two parallel writers acquire the same
 * key under pg_advisory_xact_lock and serialise — no chain forks.
 *
 * Computed via `zlib.crc32(Buffer.from('audit_log_chain'))` in Node 24.
 * 32-bit unsigned: 1224391960.
 */
export const AUDIT_CHAIN_LOCK_KEY = 1224391960
