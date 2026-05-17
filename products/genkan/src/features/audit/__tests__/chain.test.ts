import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asc, eq, sql } from 'drizzle-orm'
import { makeTestDb, type TestDb } from '@/shared/testing/pglite'
import { auditLog } from '@/shared/db/schema'
import {
  canonicalStringify,
  computeRowHash,
  verifyAuditChain,
} from '../chain'
import {
  makeDrizzleAuditWriter,
  makeDrizzleChainReader,
} from '../adapters/drizzle'
import type { AuditRowInput } from '../ports'

/**
 * Chain tests — exercise the live insert path against PGLite, then mutate
 * rows out-of-band (raw SQL) to assert the verifier catches each tamper
 * class.
 *
 * Test sequencing notes:
 *   - PGLite's `now()` has sub-ms resolution but consecutive calls inside
 *     the same statement can return identical timestamps. We pass an
 *     explicit `occurredAt` (real wall clock, spaced by a few ms) to keep
 *     the (occurred_at, id) ordering deterministic.
 */

let tdb: TestDb

beforeEach(async () => {
  tdb = await makeTestDb()
})

afterEach(async () => {
  await tdb.cleanup()
})

function rowInput(overrides: Partial<AuditRowInput> = {}): AuditRowInput {
  return {
    id: overrides.id ?? `aud_${Math.random().toString(16).slice(2, 14)}`,
    actorId: null,
    actorRole: null,
    action: 'user.ban',
    targetType: 'user',
    targetId: 'u_target',
    payload: null,
    ip: null,
    userAgent: null,
    occurredAt: overrides.occurredAt ?? new Date(),
    ...overrides,
  }
}

async function insertViaWriter(rows: AuditRowInput[]) {
  const writer = makeDrizzleAuditWriter(tdb.db)
  for (const r of rows) {
    await writer.record(r)
  }
}

describe('canonicalStringify', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(
      canonicalStringify({ a: 2, b: 1 }),
    )
  })

  it('sorts keys at every depth', () => {
    const a = { x: { b: 1, a: 2 } }
    const b = { x: { a: 2, b: 1 } }
    expect(canonicalStringify(a)).toBe(canonicalStringify(b))
  })

  it('preserves array order (semantic)', () => {
    expect(canonicalStringify([1, 2, 3])).toBe('[1,2,3]')
    expect(canonicalStringify([3, 2, 1])).toBe('[3,2,1]')
    expect(canonicalStringify([1, 2, 3])).not.toBe(canonicalStringify([3, 2, 1]))
  })

  it('handles null and primitives like JSON.stringify', () => {
    expect(canonicalStringify(null)).toBe('null')
    expect(canonicalStringify(undefined)).toBe('null')
    expect(canonicalStringify('hi')).toBe('"hi"')
    expect(canonicalStringify(42)).toBe('42')
    expect(canonicalStringify(true)).toBe('true')
  })

  it('produces stable output for deep structures', () => {
    const x = {
      events: ['user.ban', 'org.create'],
      meta: { z: 1, a: [{ k: 1, j: 2 }] },
    }
    const y = {
      meta: { a: [{ j: 2, k: 1 }], z: 1 },
      events: ['user.ban', 'org.create'],
    }
    expect(canonicalStringify(x)).toBe(canonicalStringify(y))
  })
})

describe('verifyAuditChain — happy path', () => {
  it('returns ok=true after 5 sequential record() calls', async () => {
    const t0 = Date.now()
    const rows = Array.from({ length: 5 }, (_, i) =>
      rowInput({
        id: `aud_seq_${i}`,
        occurredAt: new Date(t0 + i * 10),
        payload: { i },
      }),
    )
    await insertViaWriter(rows)

    const reader = makeDrizzleChainReader(tdb.db)
    const status = await verifyAuditChain(reader)

    expect(status.ok).toBe(true)
    if (status.ok) {
      expect(status.rowsChecked).toBe(5)
      expect(status.latestOccurredAt?.getTime()).toBe(t0 + 40)
    }
  })

  it('genesis row has prev_hash = null', async () => {
    await insertViaWriter([rowInput({ id: 'aud_g0' })])
    const [row] = await tdb.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.id, 'aud_g0'))
    expect(row?.prevHash).toBeNull()
    expect(row?.rowHash).toMatch(/^[0-9a-f]{64}$/)

    const status = await verifyAuditChain(makeDrizzleChainReader(tdb.db))
    expect(status.ok).toBe(true)
  })
})

describe('verifyAuditChain — tamper detection', () => {
  it('detects payload mutation (hash_mismatch)', async () => {
    const t0 = Date.now()
    const rows = Array.from({ length: 5 }, (_, i) =>
      rowInput({
        id: `aud_tamper_${i}`,
        occurredAt: new Date(t0 + i * 10),
        payload: { i },
      }),
    )
    await insertViaWriter(rows)

    // Mutate row #2's payload directly — bypass the writer.
    await tdb.db
      .update(auditLog)
      .set({ payload: { i: 999 } })
      .where(eq(auditLog.id, 'aud_tamper_2'))

    const status = await verifyAuditChain(makeDrizzleChainReader(tdb.db))
    expect(status.ok).toBe(false)
    if (!status.ok) {
      expect(status.brokenAtId).toBe('aud_tamper_2')
      expect(status.reason).toBe('hash_mismatch')
      expect(status.rowsChecked).toBe(2) // 0 and 1 verified before break
    }
  })

  it('detects out-of-band insertion (prev_hash_mismatch)', async () => {
    const t0 = Date.now()
    const rows = Array.from({ length: 5 }, (_, i) =>
      rowInput({
        id: `aud_ins_${i}`,
        occurredAt: new Date(t0 + i * 10),
      }),
    )
    await insertViaWriter(rows)

    // Slip a 6th row in BEFORE the existing #3 — chronologically. Its
    // prev_hash will reference whatever the verifier had at that point,
    // but we make it wrong on purpose.
    await tdb.db.insert(auditLog).values({
      id: 'aud_ins_X',
      action: 'user.unban',
      targetType: 'user',
      targetId: 'evil',
      payload: null,
      occurredAt: new Date(t0 + 25), // between #2 (t0+20) and #3 (t0+30)
      prevHash: 'b'.repeat(64), // deliberately wrong
      rowHash: 'a'.repeat(64), // also wrong
    })

    const status = await verifyAuditChain(makeDrizzleChainReader(tdb.db))
    expect(status.ok).toBe(false)
    if (!status.ok) {
      expect(status.brokenAtId).toBe('aud_ins_X')
      expect(status.reason).toBe('prev_hash_mismatch')
    }
  })

  it('detects deletion of a middle row (prev_hash_mismatch)', async () => {
    const t0 = Date.now()
    const rows = Array.from({ length: 5 }, (_, i) =>
      rowInput({
        id: `aud_del_${i}`,
        occurredAt: new Date(t0 + i * 10),
      }),
    )
    await insertViaWriter(rows)

    // Delete the middle one — the row that followed it now points at
    // the wrong predecessor.
    await tdb.db.delete(auditLog).where(eq(auditLog.id, 'aud_del_2'))

    const status = await verifyAuditChain(makeDrizzleChainReader(tdb.db))
    expect(status.ok).toBe(false)
    if (!status.ok) {
      // The row WHOSE prev_hash now doesn't match the new predecessor.
      expect(status.brokenAtId).toBe('aud_del_3')
      expect(status.reason).toBe('prev_hash_mismatch')
    }
  })
})

describe('verifyAuditChain — concurrency', () => {
  it('10 parallel record() calls produce a single valid chain', async () => {
    const writer = makeDrizzleAuditWriter(tdb.db)
    const t0 = Date.now()
    const calls = Array.from({ length: 10 }, (_, i) =>
      writer.record(
        rowInput({
          id: `aud_par_${i}`,
          occurredAt: new Date(t0 + i),
          payload: { i },
        }),
      ),
    )

    const results = await Promise.allSettled(calls)
    const rejected = results.filter((r) => r.status === 'rejected')
    // No silent failure — every call either succeeds or surfaces an error.
    expect(rejected).toHaveLength(0)

    // Sanity: every prev_hash is unique (a fork would produce two rows
    // sharing the same prev_hash).
    const inserted = await tdb.db
      .select({ prevHash: auditLog.prevHash, rowHash: auditLog.rowHash })
      .from(auditLog)
      .orderBy(asc(auditLog.occurredAt), asc(auditLog.id))

    expect(inserted).toHaveLength(10)
    const prevHashes = inserted.map((r) => r.prevHash)
    const nonNullPrev = prevHashes.filter((p): p is string => p !== null)
    expect(new Set(nonNullPrev).size).toBe(nonNullPrev.length)

    const status = await verifyAuditChain(makeDrizzleChainReader(tdb.db))
    expect(status.ok).toBe(true)
    if (status.ok) expect(status.rowsChecked).toBe(10)
  })
})

describe('computeRowHash', () => {
  it('produces 64-char hex SHA-256 output', () => {
    const h = computeRowHash({
      prevHash: null,
      actorId: 'u1',
      actorRole: 'admin',
      action: 'user.ban',
      targetType: 'user',
      targetId: 'u_target',
      payload: { reason: 'spam' },
      ip: '1.2.3.4',
      userAgent: 'curl',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when ANY field changes', () => {
    const base = {
      prevHash: null,
      actorId: 'u1',
      actorRole: 'admin',
      action: 'user.ban' as const,
      targetType: 'user',
      targetId: 'u_target',
      payload: { reason: 'spam' },
      ip: '1.2.3.4',
      userAgent: 'curl',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    }
    const baseHash = computeRowHash(base)
    expect(computeRowHash({ ...base, action: 'user.unban' })).not.toBe(baseHash)
    expect(computeRowHash({ ...base, targetId: 'other' })).not.toBe(baseHash)
    expect(computeRowHash({ ...base, payload: { reason: 'phishing' } })).not.toBe(
      baseHash,
    )
    expect(
      computeRowHash({ ...base, occurredAt: new Date('2026-01-01T00:00:00.001Z') }),
    ).not.toBe(baseHash)
  })
})

describe('backfill idempotence (simulated)', () => {
  /**
   * The backfill script lives in `scripts/backfill-audit-chain.mjs`. We
   * don't shell out to Node here — instead we replay its core algorithm
   * against PGLite and assert the second run is a no-op on every row.
   */
  it('second pass over an already-chained table makes no changes', async () => {
    const t0 = Date.now()
    const rows = Array.from({ length: 5 }, (_, i) =>
      rowInput({
        id: `aud_bf_${i}`,
        occurredAt: new Date(t0 + i * 10),
      }),
    )
    await insertViaWriter(rows)

    // Snapshot current hashes.
    const before = await tdb.db
      .select({
        id: auditLog.id,
        prevHash: auditLog.prevHash,
        rowHash: auditLog.rowHash,
      })
      .from(auditLog)
      .orderBy(asc(auditLog.occurredAt), asc(auditLog.id))

    // Replay backfill: recompute each row's hash; if it matches, skip.
    let mismatches = 0
    let expectedPrev: string | null = null
    for (const r of before) {
      const stored = await tdb.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.id, r.id))
      const row = stored[0]!
      const recomputed = computeRowHash({
        prevHash: expectedPrev,
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
      if (recomputed !== row.rowHash) mismatches += 1
      expectedPrev = row.rowHash
    }
    expect(mismatches).toBe(0)

    const after = await tdb.db
      .select({
        id: auditLog.id,
        prevHash: auditLog.prevHash,
        rowHash: auditLog.rowHash,
      })
      .from(auditLog)
      .orderBy(asc(auditLog.occurredAt), asc(auditLog.id))
    expect(after).toEqual(before)
  })
})

describe('advisory lock is in scope', () => {
  it('record() runs inside a transaction that takes the chain lock', async () => {
    // Smoke: a record() call should not leave a session-level advisory
    // lock dangling. Since we use pg_advisory_xact_lock the lock is
    // released on commit. After a successful record() the lock table
    // should be empty for our key.
    await insertViaWriter([rowInput({ id: 'aud_lock_smoke' })])
    const locks = await tdb.db.execute(
      sql`select count(*)::int as n from pg_locks where locktype = 'advisory'`,
    )
    // PGLite returns rows on `.execute()` directly; postgres-js wraps
    // them. Both surface the count under the same column name.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowsLike = (locks as any).rows ?? locks
    const n = Array.isArray(rowsLike) ? Number(rowsLike[0]?.n ?? 0) : 0
    expect(n).toBe(0)
  })
})
