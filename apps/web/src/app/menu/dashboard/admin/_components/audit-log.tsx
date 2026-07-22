'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@iedora/ui/components/ui/collapsible'
import type { AuditRecord } from '@iedora/product-menu/shared/api'
import { formatDate } from '../restaurants/_components/primitives'

// Maps the service's audit action codes onto `Admin.audit.<key>` i18n keys.
// Covers every action emitted across auth / menu / billing so the user activity
// timeline reads in plain language (a failed login is special-cased below).
const AUDIT_KEYS: Record<string, string> = {
  // auth
  'auth.session.login': 'login',
  'auth.session.logout': 'logout',
  'auth.session.logout_all': 'logoutAll',
  'auth.token.refresh': 'tokenRefresh',
  'auth.token.reuse_detected': 'tokenReuse',
  'auth.user.register': 'register',
  'auth.user.role_granted': 'roleGranted',
  'auth.user.password_reset_requested': 'passwordResetRequested',
  'auth.user.password_reset_completed': 'passwordResetCompleted',
  'auth.user.password_changed': 'passwordChanged',
  'auth.user.force_password_change': 'forcePasswordChange',
  'auth.user.password_set_by_admin': 'passwordSetByAdmin',
  'auth.session.revoked_by_admin': 'sessionRevoked',
  'auth.tenant.created': 'tenantCreated',
  'auth.tenant.owner_transferred': 'tenantOwnerTransferred',
  // menu
  'menu.restaurant.created': 'created',
  'menu.restaurant.renamed': 'renamed',
  'menu.restaurant.slug_renamed': 'slugRenamed',
  'menu.restaurant.deleted': 'deleted',
  'menu.restaurant.owner_transferred': 'ownerTransferred',
  'menu.restaurant.qr_printed': 'qrPrinted',
  // billing
  'billing.subscription.created': 'subscriptionCreated',
  'billing.subscription.canceled': 'subscriptionCanceled',
  'billing.subscription.expired': 'subscriptionExpired',
  'billing.payment.recorded': 'paymentRecorded',
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
  return formatDate(iso)
}

/** The failure reason a failed sign-in carries in `meta` (bad_password, etc.). */
function failureReason(e: AuditRecord): string | undefined {
  if (e.outcome !== 'failure' || !e.meta || typeof e.meta !== 'object') return undefined
  const r = (e.meta as Record<string, unknown>).reason
  return typeof r === 'string' ? r : undefined
}

/**
 * The extra fields + `meta` payload that make an event worth expanding.
 * Returns an ordered list of [label, value]; empty ⇒ the row is a plain,
 * non-interactive line (nothing to reveal).
 */
function auditData(e: AuditRecord): [string, string][] {
  const out: [string, string][] = []
  if (e.outcome && e.outcome !== 'success') out.push(['outcome', e.outcome])
  if (e.ip) out.push(['ip', e.ip])
  if (e.userAgent) out.push(['device', e.userAgent])
  if (e.targetId) out.push(['target', e.targetType ? `${e.targetType}:${e.targetId}` : e.targetId])
  if (e.actorId) out.push(['actor', e.actorType ? `${e.actorType}:${e.actorId}` : e.actorId])
  if (e.sessionId) out.push(['session', e.sessionId])
  if (e.traceId) out.push(['trace', e.traceId])
  if (e.meta && typeof e.meta === 'object' && Object.keys(e.meta).length > 0) {
    out.push(['meta', JSON.stringify(e.meta, null, 2)])
  }
  return out
}

function Summary({ label, sub, danger }: { label: string; sub: string; danger?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <p className={`truncate text-[14px] font-medium ${danger ? 'text-destructive' : 'text-foreground'}`}>
        {label}
      </p>
      <p className="truncate text-[12px] text-muted-foreground">{sub}</p>
    </div>
  )
}

/**
 * Shared admin audit trail. Renders any `AuditRecord[]` (a restaurant's tenant
 * feed or a user's cross-domain timeline). Each event that carries extra detail
 * (IP, device, meta, target, session…) becomes a Collapsible that reveals it on
 * demand; bare events stay a plain row. Failed sign-ins read in red.
 */
export function AuditLog({ events }: { events: AuditRecord[] }) {
  const t = useTranslations('Admin')

  if (events.length === 0) {
    return <p className="py-3 text-[14px] text-muted-foreground">{t('audit.noActivity')}</p>
  }

  return (
    <ul data-test-id="admin-audit-list">
      {events.map((e) => {
        const failedLogin = e.action === 'auth.session.login' && e.outcome === 'failure'
        const key = failedLogin ? 'loginFailed' : AUDIT_KEYS[e.action]
        const label = key ? t(`audit.${key}`) : e.action
        // Source + IP inline so the security-relevant context reads at a glance;
        // a failed sign-in also shows its reason.
        const reason = failureReason(e)
        const reasonLabel = reason
          ? t.has(`audit.reason.${reason}`)
            ? t(`audit.reason.${reason}`)
            : reason
          : undefined
        const sub = [e.source, e.ip ?? undefined, reasonLabel].filter(Boolean).join(' · ')
        const when = formatRelative(e.at)
        const data = auditData(e)

        if (data.length === 0) {
          return (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 border-b border-border py-[11px] last:border-b-0"
            >
              <Summary label={label} sub={sub} danger={failedLogin} />
              <time className="shrink-0 text-[12px] text-muted-foreground">{when}</time>
            </li>
          )
        }

        return (
          <li key={e.id} className="border-b border-border last:border-b-0">
            <Collapsible>
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 py-[11px] text-left outline-none">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className="shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
                  />
                  <Summary label={label} sub={sub} danger={failedLogin} />
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
