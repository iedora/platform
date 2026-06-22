import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ChevronLeft, Pencil } from 'lucide-react'
import { requireStaff } from '@iedora/product-menu/features/auth'
import { loadRestaurantDetail } from '@iedora/product-menu/features/restaurant-identity'
import { AdminQrCard } from '@iedora/product-menu/features/restaurant-identity/ui/admin-qr-card'
import { ApiError } from '@iedora/api-client'
import {
  AdminCard,
  AuditList,
  EntityRow,
  InfoRow,
  Metric,
  SideCard,
  StatusPill,
  formatDate,
  formatMoney,
  initialsOf,
  liveStatus,
  planNamer,
} from '../_components/admin-detail'

/**
 * Admin restaurant detail (`/menu/dashboard/admin/restaurants/[id]`) —
 * staff-only, matching Pencil "Admin · Restaurant detail" (jT0xk): a
 * back-link + title + status header, then a two-column body — metrics +
 * Details + Audit log on the left, QR / Owner / Tenant / Payments cards
 * on the right rail. One aggregated read (record + menus + trend + the
 * tenant's billing + the restaurant's audit trail) drives the page;
 * billing/audit are best-effort, so a section may be empty, never broken.
 */
export default async function AdminRestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireStaff()
  const { id } = await params

  const detail = await loadRestaurantDetail(id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound()
    throw e
  })

  const { restaurant: r, menus, trend, billing, audit, tenant } = detail
  const activeSub = billing.subscriptions.find(
    (s) => s.product === 'menu' && s.status === 'active',
  )
  // Latest invoice = the most recent by issue date (the service doesn't
  // guarantee order), powering the "Last payment" line.
  const lastInvoice = [...billing.invoices].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  )[0]
  const views14d = trend.reduce((sum, p) => sum + p.count, 0)
  const [t, planName] = await Promise.all([getTranslations('Admin'), planNamer()])
  const live = liveStatus(menus) === 'Live'
  const publicUrl = `https://iedora.com/m/${r.slug}`

  return (
    <div className="space-y-6" data-test-id="admin-restaurant-detail">
      {/* Header — back link, title + status, then View public / Edit. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            href="/menu/dashboard/admin/restaurants"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
            data-test-id="admin-restaurant-back"
          >
            <ChevronLeft size={16} strokeWidth={2} />
            {t('detail.back')}
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-[family-name:var(--display)] text-[26px] font-extrabold tracking-[-0.5px] text-foreground">
              {r.name}
            </h1>
            <StatusPill live={live} label={t(live ? 'restaurants.statusLive' : 'restaurants.statusDraft')} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5" data-test-id="admin-restaurant-actions">
          <Link
            href={`/menu/r/${r.slug}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-2 text-[14px] font-semibold text-foreground no-underline transition-colors hover:border-foreground"
          >
            {t('detail.viewPublic')}
          </Link>
          <Link
            href={`/menu/dashboard/admin/restaurants/${r.id}/edit`}
            className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2 text-[14px] font-semibold text-white no-underline transition-colors hover:bg-[var(--cinnabar-deep)]"
          >
            <Pencil size={15} strokeWidth={2.2} />
            {t('detail.edit')}
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Left rail — metrics, details, audit log. */}
        <div className="grid content-start gap-5">
          <section
            className="grid grid-cols-2 gap-4 sm:grid-cols-4"
            aria-label={t('detail.details')}
            data-test-id="admin-restaurant-metrics"
          >
            <Metric label={t('detail.metricViews30d')} value={r.views30d.toLocaleString()} />
            <Metric label={t('detail.metricViews14d')} value={views14d.toLocaleString()} />
            <Metric label={t('detail.metricMenus')} value={String(r.menus)} />
            <Metric label={t('detail.metricItems')} value={String(r.items)} />
          </section>

          <AdminCard title={t('detail.details')}>
            <InfoRow label={t('detail.id')} value={r.id} mono />
            <InfoRow label={t('detail.slug')} value={r.slug} mono />
            <InfoRow label={t('detail.publicUrl')} value={`iedora.com/m/${r.slug}`} mono />
            <InfoRow label={t('detail.created')} value={formatDate(r.createdAt)} />
          </AdminCard>

          <AdminCard title={t('detail.auditLog')} data-test-id="admin-restaurant-audit">
            <AuditList events={audit} />
          </AdminCard>
        </div>

        {/* Right rail — QR, owner, tenant, payments. */}
        <div className="grid content-start gap-5">
          <SideCard
            title={t('detail.qrCode')}
            action={{ href: `/menu/dashboard/r/${r.slug}/qr`, label: t('detail.openQr') }}
            data-test-id="admin-restaurant-qr"
          >
            <AdminQrCard
              publicUrl={publicUrl}
              fileName={`menu-qr-${r.slug}`}
              downloadLabel={t('detail.downloadPng')}
            />
          </SideCard>

          <SideCard title={t('detail.owner')} data-test-id="admin-restaurant-owner">
            {tenant ? (
              <EntityRow
                initials={initialsOf(tenant.owner.name ?? tenant.owner.email)}
                name={tenant.owner.name ?? tenant.owner.email}
                sub={tenant.owner.email}
              />
            ) : (
              <p className="text-[13px] text-muted-foreground">{t('detail.ownerUnavailable')}</p>
            )}
          </SideCard>

          <SideCard title={t('detail.tenant')} data-test-id="admin-restaurant-tenant">
            {tenant ? (
              <EntityRow initials={initialsOf(tenant.name)} name={tenant.name} sub={tenant.id} />
            ) : (
              <p className="text-[13px] text-muted-foreground">{t('detail.tenantUnavailable')}</p>
            )}
          </SideCard>

          <SideCard
            title={t('detail.payments')}
            action={{ href: `/menu/dashboard/admin/restaurants/${r.id}/payments`, label: t('detail.manage') }}
            data-test-id="admin-restaurant-billing"
          >
            <InfoRow label={t('detail.plan')} value={planName(activeSub?.planCode)} />
            <InfoRow
              label={t('detail.lastPayment')}
              value={
                lastInvoice
                  ? `${formatMoney(lastInvoice.amountCents, lastInvoice.currency)} · ${formatDate(lastInvoice.createdAt)}`
                  : '—'
              }
            />
            <InfoRow
              label={t('detail.nextDue')}
              value={activeSub?.currentPeriodEnd ? formatDate(activeSub.currentPeriodEnd) : '—'}
            />
          </SideCard>
        </div>
      </div>
    </div>
  )
}
