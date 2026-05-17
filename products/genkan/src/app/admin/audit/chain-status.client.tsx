'use client'

import { useState, useTransition } from 'react'
import { Button } from '@iedora/design-system'
import type { AuditChainStatus } from '@/features/audit'
import { verifyChainAction } from './verify-actions'

/**
 * Status banner above the audit table. Renders a hairline-bordered strip
 * that's:
 *   - green when the last verify reported `ok: true`
 *   - cinnabar when the last verify reported `ok: false`
 *
 * The "Verify chain" button re-runs the server action. We surface the
 * latest result locally — no global state, no cookie — so a page refresh
 * falls back to the server-rendered `initial` status, which keeps the
 * page authoritative for fresh loads.
 */
export function ChainStatus({ initial }: { initial: AuditChainStatus }) {
  const [status, setStatus] = useState<AuditChainStatus>(initial)
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const next = await verifyChainAction()
      setStatus(next)
    })
  }

  const ok = status.ok
  const accent = ok ? 'var(--live, #1f9d55)' : 'var(--cinnabar, #c0392b)'
  const label = ok
    ? `Chain verified · ${status.rowsChecked} row${
        status.rowsChecked === 1 ? '' : 's'
      }${
        status.latestOccurredAt
          ? ` · last entry ${formatWhen(status.latestOccurredAt)}`
          : ''
      }`
    : `Chain BROKEN at ${status.brokenAtId} (${status.reason})`

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        marginBottom: 24,
        borderTop: `1px solid ${accent}`,
        borderBottom: `1px solid ${accent}`,
        fontFamily: 'var(--mono)',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ink)',
      }}
    >
      <span style={{ color: accent }}>{label}</span>
      <Button
        variant="ghost"
        type="button"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? 'Verifying…' : 'Verify chain'}
      </Button>
    </div>
  )
}

function formatWhen(d: Date | string): string {
  // `verifyChainAction` returns a Date in-memory; over the server-action
  // wire it round-trips via the structured-clone-ish RSC payload and stays
  // a Date. Production verification might serialize via JSON in some
  // future path — accept both.
  const date = d instanceof Date ? d : new Date(d)
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
