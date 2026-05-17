import Link from 'next/link'
import { Badge, EmptyState, Table, Td, Th } from '@iedora/design-system'
import { requireAdmin } from '@/features/admin'
import {
  ALL_AUDIT_ACTIONS,
  list,
  listKnownTargetTypes,
  verifyChainStatus,
  type AuditAction,
} from '@/features/audit'
import { Mono, PageHead } from '../_lib/editorial'
import { AuditFilters } from './filters.client'
import { ChainStatus } from './chain-status.client'
import { PayloadViewer } from './payload-viewer.client'

export const metadata = { title: 'Audit · Admin' }

const PAGE_SIZE = 50

type SearchParams = Promise<{
  actor?: string
  action?: string | string[]
  target_type?: string
  target_id?: string
  range?: string
  cursor_at?: string
  cursor_id?: string
}>

function fmtDateTime(d: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/**
 * Map the URL `range` literal to an inclusive `since` cutoff. Returns
 * `undefined` for `all` / unknown so the query stays unfiltered on time.
 */
function rangeToSince(range: string | undefined): Date | undefined {
  if (!range || range === 'all') return undefined
  const now = Date.now()
  switch (range) {
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000)
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000)
    default:
      return undefined
  }
}

function badgeVariantForAction(action: string): React.ComponentProps<typeof Badge>['variant'] {
  if (action.startsWith('user.ban') || action.endsWith('.delete')) return 'accent'
  if (action.startsWith('user.impersonate')) return 'ink'
  if (action.endsWith('.register') || action.endsWith('.create')) return 'live'
  return 'default'
}

function truncate(s: string | null, n = 16): string {
  if (!s) return '—'
  if (s.length <= n) return s
  return `${s.slice(0, n)}…`
}

/**
 * Normalize the `?action=` searchParam (string | string[] | undefined) to
 * a typed list of audit actions. Unknown literals are silently dropped so
 * URL tampering can't crash the page.
 */
function parseActions(raw: string | string[] | undefined): AuditAction[] {
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  const known = new Set<string>(ALL_AUDIT_ACTIONS)
  return arr.filter((a): a is AuditAction => known.has(a))
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin('/admin/audit')
  const sp = await searchParams

  const cursor =
    sp.cursor_at && sp.cursor_id
      ? { occurredAt: new Date(sp.cursor_at), id: sp.cursor_id }
      : null

  const since = rangeToSince(sp.range)

  const [{ rows, nextCursor }, targetTypes, chainStatus] = await Promise.all([
    list({
      actorEmail: sp.actor,
      actions: parseActions(sp.action),
      targetType: sp.target_type,
      targetId: sp.target_id,
      since,
      limit: PAGE_SIZE,
      cursor,
    }),
    listKnownTargetTypes(),
    // Chain verification runs on every page render. Audit page is admin-
    // only + low-traffic; the verifier completes in well under 100ms for
    // tables under ~1M rows. If this becomes a bottleneck, move it onto
    // a background worker and read the last-known status here.
    verifyChainStatus(),
  ])

  // Build the "Next page" link by replaying the current query plus the
  // returned cursor. The "First page" link drops cursor_* and keeps the
  // filters — same idea, inverse direction.
  function nextHref(): string | null {
    if (!nextCursor) return null
    const params = new URLSearchParams()
    if (sp.actor) params.set('actor', sp.actor)
    for (const a of parseActions(sp.action)) params.append('action', a)
    if (sp.target_type) params.set('target_type', sp.target_type)
    if (sp.target_id) params.set('target_id', sp.target_id)
    if (sp.range) params.set('range', sp.range)
    params.set('cursor_at', nextCursor.occurredAt.toISOString())
    params.set('cursor_id', nextCursor.id)
    return `?${params.toString()}`
  }

  function firstHref(): string | null {
    if (!cursor) return null
    const params = new URLSearchParams()
    if (sp.actor) params.set('actor', sp.actor)
    for (const a of parseActions(sp.action)) params.append('action', a)
    if (sp.target_type) params.set('target_type', sp.target_type)
    if (sp.target_id) params.set('target_id', sp.target_id)
    if (sp.range) params.set('range', sp.range)
    return params.toString() ? `?${params.toString()}` : '?'
  }

  const next = nextHref()
  const first = firstHref()

  return (
    <>
      <PageHead
        eyebrow="/ 06  Audit"
        title="What happened, recently."
        note="Append-only trail of every meaningful admin and identity action. Newest first."
      />

      <ChainStatus initial={chainStatus} />

      <AuditFilters
        actions={ALL_AUDIT_ACTIONS}
        targetTypes={targetTypes}
      />

      {rows.length === 0 ? (
        <EmptyState
          label="No events"
          note="Nothing matches the current filters. Widen the date range or clear filters."
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Payload</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Mono>{fmtDateTime(r.occurredAt)}</Mono>
                  </Td>
                  <Td>
                    {r.actorEmail ? (
                      <span>
                        {r.actorId ? (
                          <Link
                            href={`/admin/users/${r.actorId}`}
                            style={{ textDecoration: 'none' }}
                          >
                            {r.actorEmail}
                          </Link>
                        ) : (
                          r.actorEmail
                        )}{' '}
                        <Mono>({r.actorRole ?? '—'})</Mono>
                      </span>
                    ) : (
                      <Mono>—</Mono>
                    )}
                  </Td>
                  <Td>
                    <Badge variant={badgeVariantForAction(r.action)}>
                      {r.action}
                    </Badge>
                  </Td>
                  <Td>
                    <Mono>{r.targetType ?? '—'}</Mono>{' '}
                    <span title={r.targetId ?? ''}>
                      <Mono>{truncate(r.targetId)}</Mono>
                    </span>
                  </Td>
                  <Td>
                    <PayloadViewer payload={r.payload} />
                  </Td>
                  <Td>
                    <Mono>{r.ip ?? '—'}</Mono>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid var(--ink-14)',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              color: 'var(--ink-70)',
            }}
          >
            <span>
              Showing {rows.length} event{rows.length === 1 ? '' : 's'} · page
              size {PAGE_SIZE}
            </span>
            <span style={{ display: 'flex', gap: 16 }}>
              {first ? (
                <Link href={first} style={{ color: 'var(--ink)' }}>
                  ← First page
                </Link>
              ) : null}
              {next ? (
                <Link href={next} style={{ color: 'var(--ink)' }}>
                  Next page →
                </Link>
              ) : null}
            </span>
          </div>
        </>
      )}
    </>
  )
}
