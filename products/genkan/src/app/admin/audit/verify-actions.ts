'use server'

import { requireAdmin } from '@/features/admin'
import { verifyChainStatus } from '@/features/audit'
import type { AuditChainStatus } from '@/features/audit'

/**
 * Trigger an end-to-end chain verification from the admin page. Gated by
 * `requireAdmin` — verification reads every row, so we don't want
 * anonymous traffic running it.
 *
 * The verifier returns the first break it finds, so a tampered chain
 * still completes quickly. On a clean chain the cost is O(rows) on the
 * existing `occurred_at` index — well under a second for tables we care
 * about.
 */
export async function verifyChainAction(): Promise<AuditChainStatus> {
  await requireAdmin('/admin/audit')
  return verifyChainStatus()
}
