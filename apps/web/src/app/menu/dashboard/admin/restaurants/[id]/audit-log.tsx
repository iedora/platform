'use client'

import { useTranslations } from 'next-intl'
import { CaretDownIcon } from '@phosphor-icons/react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@iedora/ui/components/ui/collapsible'
import type { AuditRecord } from '@iedora/product-menu/shared/api'

// Maps the service's audit action codes onto `Admin.audit.<key>` i18n keys.
const AUDIT_KEYS: Record<string, string> = {
  'menu.restaurant.created': 'created',
  'menu.restaurant.slug_renamed': 'slugRenamed',
  'menu.restaurant.deleted': 'deleted',
  'menu.restaurant.owner_transferred': 'ownerTransferred',
  'menu.restaurant.qr_printed': 'qrPrinted',
  'billing.subscription.created': 'subscriptionCreated',
  'billing.payment.recorded': 'paymentRecorded',
  'billing.subscription.expired': 'subscriptionExpired',
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (Number.isNaN(diff)) return ''
  const days = Math.floor(diff / 86_400_000)
  if (days <= 0) {
    const h = Math.floor(diff / 3_600_000)
    return h <= 0 ? 'just now' : `${h}h`
  }
  if (days < 30) return `${days}d`
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * The extra fields + `meta` payload that make an event worth expanding.
 * Returns an ordered list of [label, value]; empty ⇒ the row is a plain,
 * non-interactive line (nothing to reveal).
 */
function auditData(e: AuditRecord): [string, string][] {
  const out: [string, string][] = []
  if (e.outcome && e.outcome !== 'success') out.push(['outcome', e.outcome])
  if (e.targetId) out.push(['target', e.targetType ? `${e.targetType}:${e.targetId}` : e.targetId])
  if (e.actorId) out.push(['actor', e.actorType ? `${e.actorType}:${e.actorId}` : e.actorId])
  if (e.sessionId) out.push(['session', e.sessionId])
  if (e.traceId) out.push(['trace', e.traceId])
  if (e.meta && typeof e.meta === 'object' && Object.keys(e.meta).length > 0) {
    out.push(['meta', JSON.stringify(e.meta, null, 2)])
  }
  return out
}

function Summary({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[14px] font-medium text-foreground">{label}</p>
      <p className="truncate text-[12px] text-muted-foreground">{sub}</p>
    </div>
  )
}

/**
 * Restaurant audit trail. Each event that carries extra detail (`meta`
 * payload, target, session, trace…) becomes a shadcn Collapsible that
 * reveals that data on demand; events with nothing to show stay a plain
 * row.
 */
export function AuditLog({ events }: { events: AuditRecord[] }) {
  const t = useTranslations('Admin')

  if (events.length === 0) {
    return <p className="py-3 text-[14px] text-muted-foreground">{t('audit.noActivity')}</p>
  }

  return (
    <ul data-test-id="admin-audit-list">
      {events.map((e) => {
        const key = AUDIT_KEYS[e.action]
        const label = key ? t(`audit.${key}`) : e.action
        const sub = (e.actorId ?? e.actorType) + ' · ' + e.source
        const when = formatRelative(e.at)
        const data = auditData(e)

        if (data.length === 0) {
          return (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 border-b border-border py-[11px] last:border-b-0"
            >
              <Summary label={label} sub={sub} />
              <time className="shrink-0 text-[12px] text-muted-foreground">{when}</time>
            </li>
          )
        }

        return (
          <li key={e.id} className="border-b border-border last:border-b-0">
            <Collapsible>
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 py-[11px] text-left outline-none">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <CaretDownIcon
                    size={14}
                    weight="bold"
                    aria-hidden
                    className="shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
                  />
                  <Summary label={label} sub={sub} />
                </div>
                <time className="shrink-0 text-[12px] text-muted-foreground">{when}</time>
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden">
                <dl className="mb-3 ml-6 grid gap-1.5 rounded-[10px] bg-muted/60 p-3 text-[12px]">
                  {data.map(([k, v]) =>
                    k === 'meta' ? (
                      <div key={k} className="min-w-0">
                        <dt className="font-semibold uppercase tracking-[0.05em] text-muted-foreground">{k}</dt>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11.5px] text-foreground">
                          {v}
                        </pre>
                      </div>
                    ) : (
                      <div key={k} className="flex gap-2">
                        <dt className="shrink-0 font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                          {k}
                        </dt>
                        <dd className="min-w-0 truncate font-mono text-foreground" title={v}>
                          {v}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </CollapsibleContent>
            </Collapsible>
          </li>
        )
      })}
    </ul>
  )
}
