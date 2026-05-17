#!/usr/bin/env node
/**
 * One-shot backfill: populate `prev_hash` + `row_hash` for every audit row
 * that pre-dates migration 0004 (which added the columns NULL).
 *
 * Usage (in production, with the deploy stack quiesced):
 *
 *   kamal app exec --reuse "node scripts/backfill-audit-chain.mjs"
 *
 * Idempotent:
 *   - rows that already have a non-null `row_hash` are recomputed; if the
 *     stored hash matches, the row is skipped silently;
 *   - if the stored hash DOESN'T match, the script aborts with a clear
 *     message — that row was tampered with before the chain existed, and
 *     a human needs to look at it before continuing.
 *
 * The script acquires the same `pg_advisory_xact_lock` the chain writer
 * uses, so a concurrent runtime can't slip an INSERT in mid-backfill.
 * Belt-and-braces: deploys should be quiesced when this runs.
 *
 * No new dependencies: uses `postgres` (already a runtime dep) and
 * `node:crypto`.
 */
import { createHash } from 'node:crypto'
import postgres from 'postgres'

const SEP = '\x1f'
// Must match `AUDIT_CHAIN_LOCK_KEY` in `src/features/audit/chain.ts`.
// CRC32 of 'audit_log_chain'.
const AUDIT_CHAIN_LOCK_KEY = 1224391960
const BATCH_SIZE = 500

/** Canonical JSON stringify — sorted keys at every depth. */
function canonicalStringify(value) {
  if (value === null || value === undefined) return 'null'
  const t = typeof value
  if (t === 'number' || t === 'boolean' || t === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']'
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort()
    return (
      '{' +
      keys
        .map((k) => JSON.stringify(k) + ':' + canonicalStringify(value[k]))
        .join(',') +
      '}'
    )
  }
  return 'null'
}

function computeRowHash(input) {
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

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is required.')
    process.exit(1)
  }

  const sql = postgres(url, { max: 1, prepare: false })

  let chained = 0
  let skipped = 0
  let mismatches = 0
  let cursor = null // { occurredAt: Date, id: string }
  let expectedPrev = null

  try {
    await sql.begin(async (tx) => {
      // Hold the chain lock for the entire backfill. Released on commit
      // or rollback. Lock contention with a live writer would either be
      // serialized (small chance — operator should quiesce the app) or
      // would error fast on the writer side, which is the correct
      // failure mode for an admin maintenance task.
      await tx`select pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`

      for (;;) {
        const batch = cursor
          ? await tx`
              select id, actor_id, actor_role, action, target_type, target_id,
                     payload, ip, user_agent, occurred_at, prev_hash, row_hash
              from audit_log
              where (occurred_at, id) > (${cursor.occurredAt}, ${cursor.id})
              order by occurred_at asc, id asc
              limit ${BATCH_SIZE}
            `
          : await tx`
              select id, actor_id, actor_role, action, target_type, target_id,
                     payload, ip, user_agent, occurred_at, prev_hash, row_hash
              from audit_log
              order by occurred_at asc, id asc
              limit ${BATCH_SIZE}
            `

        if (batch.length === 0) break

        for (const row of batch) {
          const occurred =
            row.occurred_at instanceof Date
              ? row.occurred_at
              : new Date(row.occurred_at)
          const recomputed = computeRowHash({
            prevHash: expectedPrev,
            actorId: row.actor_id,
            actorRole: row.actor_role,
            action: row.action,
            targetType: row.target_type,
            targetId: row.target_id,
            payload: row.payload,
            ip: row.ip,
            userAgent: row.user_agent,
            occurredAt: occurred,
          })

          if (row.row_hash !== null) {
            // Already chained — verify and skip without writing.
            if (row.row_hash !== recomputed || row.prev_hash !== expectedPrev) {
              mismatches += 1
              console.error(
                `[backfill] HASH MISMATCH at row ${row.id} ` +
                  `(occurred_at=${occurred.toISOString()}). ` +
                  `Stored hash differs from recomputed; this row was ` +
                  `tampered with before the chain existed. Aborting.`,
              )
              throw new Error('audit chain mismatch — operator intervention required')
            }
            skipped += 1
          } else {
            await tx`
              update audit_log
              set prev_hash = ${expectedPrev}, row_hash = ${recomputed}
              where id = ${row.id}
            `
            chained += 1
          }

          expectedPrev = recomputed
        }

        const last = batch[batch.length - 1]
        cursor = {
          occurredAt:
            last.occurred_at instanceof Date
              ? last.occurred_at
              : new Date(last.occurred_at),
          id: last.id,
        }
        if (batch.length < BATCH_SIZE) break
      }
    })
  } finally {
    await sql.end({ timeout: 5 })
  }

  console.log(
    `Chained ${chained} rows. Skipped ${skipped} already-chained rows. ` +
      `Found ${mismatches} mismatches.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
