import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireStaff } from '@iedora/product-menu/features/auth'
import { loadRestaurantDetail } from '@iedora/product-menu/features/restaurant-identity'
import { ApiError } from '@iedora/api-client'
import { PRODUCTS, productUrl } from '@iedora/brand'
import { Badge } from '@iedora/ui/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@iedora/ui/components/ui/tabs'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { TransferOwner } from './transfer-owner'
import { RestaurantAuditTab } from './restaurant-audit-tab'
import { CopyValue } from '../_components/copy-value'
import {
  CardLabel,
  EntityRow,
  InfoRow,
  PropertyRow,
  SideCard,
  Stat,
  StatusPill,
  formatDate,
  formatMoney,
  initialsOf,
  liveStatus,
  planNamer,
} from '../_components/admin-detail'

/**
 * Admin restaurant record (`/menu/dashboard/admin/restaurants/[id]`),
 * staff-only — a CRM-style account view. A header with the plan tag, then
 * an always-visible Record-Details rail (owner / tenant / plan / status /
 * the structured attributes) beside a tabbed main area (Overview = the
 * numbers + billing + QR, Activity = the audit feed). Owner + plan lead;
 * the audit log is a secondary tab. One aggregated read drives the page;
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

  const { restaurant: r, menus, trend, billing, tenant } = detail
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
  const plan = planName(activeSub?.planCode)
  // Payment-aware status: the subscription's period end drives "expired" /
  // "expiring soon (<= 30 days)"; otherwise fall back to the menu live/draft
  // state. (An expired paid plan should read as a billing problem, not "Live".)
  const periodEndMs = activeSub?.currentPeriodEnd ? new Date(activeSub.currentPeriodEnd).getTime() : null
  const nowMs = Date.now()
  const DAY = 86_400_000
  const status =
    periodEndMs != null && periodEndMs <= nowMs
      ? { tone: 'danger' as const, label: t('detail.paymentExpired') }
      : periodEndMs != null && periodEndMs - nowMs <= 30 * DAY
        ? { tone: 'warning' as const, label: t('detail.paymentExpiring') }
        : live
          ? { tone: 'success' as const, label: t('restaurants.statusLive') }
          : { tone: 'muted' as const, label: t('restaurants.statusDraft') }
  // Env-based public menu origin: productUrl() reads MENU_SURFACE_URL
  // (http://localhost:3000/menu in dev, https://menu.iedora.com in prod), so
  // the QR + displayed link resolve to the right host per environment.
  const publicOrigin = productUrl(PRODUCTS.menu)
  const publicUrl = `${publicOrigin}/r/${r.slug}`
  const detailHref = `/menu/dashboard/admin/restaurants/${r.id}`
  // QR management + print live on the restaurant's own QR page (staff can open
  // it cross-tenant); the admin record just links there rather than embedding
  // a second copy of the shelf.
  const qrHref = `/menu/dashboard/r/${r.slug}/qr`

  return (
    <DashboardPage chrome="none" title={r.name} data-test-id="admin-restaurant-detail">
      {/* CRM record body: properties rail (left) + tabbed main (right).
          Mobile-first: the tabbed content (metrics, billing) leads; the
          properties rail drops below it. On lg+ the rail returns to the left
          column via `order`. */}
      <div className="grid gap-5 lg:grid-cols-[320px_1fr] lg:items-start">
        {/* Record-Details rail. */}
        <div className="order-2 space-y-5 lg:order-1">
          <SideCard title={t('detail.owner')} data-test-id="admin-restaurant-owner">
            {tenant ? (
              <div className="space-y-3">
                <EntityRow
                  initials={initialsOf(tenant.owner.name ?? tenant.owner.email)}
                  name={tenant.owner.name ?? tenant.owner.email}
                  sub={tenant.owner.email}
                />
                <div className="border-t border-border" />
                <div data-test-id="admin-restaurant-tenant">
                  <CardLabel>{t('detail.tenant')}</CardLabel>
                  <EntityRow initials={initialsOf(tenant.name)} name={tenant.name} sub={tenant.id} />
                </div>
                <TransferOwner restaurantId={r.id} currentTenantId={tenant.id} />
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">{t('detail.ownerUnavailable')}</p>
            )}
          </SideCard>

          <SideCard title={t('detail.details')}>
            <PropertyRow label={t('detail.plan')}>
              <Badge variant="secondary">{plan}</Badge>
            </PropertyRow>
            <PropertyRow label={t('detail.status')}>
              <StatusPill tone={status.tone} label={status.label} />
            </PropertyRow>
            <PropertyRow label={t('detail.created')}>{formatDate(r.createdAt)}</PropertyRow>
            <PropertyRow label={t('detail.slug')}>
              <CopyValue value={r.slug} />
            </PropertyRow>
            <PropertyRow label={t('detail.publicUrl')}>
              <CopyValue value={publicUrl} display={publicUrl.replace(/^https?:\/\//, '')} href={publicUrl} />
            </PropertyRow>
            <PropertyRow label={t('detail.id')}>
              <CopyValue value={r.id} />
            </PropertyRow>
          </SideCard>
        </div>

        {/* Tabbed main. */}
        <div className="order-1 min-w-0 lg:order-2">
          <Tabs defaultValue="overview" className="gap-5">
            <TabsList className="w-full sm:w-fit">
              <TabsTrigger value="overview" data-test-id="admin-tab-overview">
                {t('detail.overview')}
              </TabsTrigger>
              <TabsTrigger value="activity" data-test-id="admin-tab-activity">
                {t('detail.activity')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-5">
              <section
                className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[18px] border border-border bg-card p-5 sm:grid-cols-4"
                aria-label={t('detail.details')}
                data-test-id="admin-restaurant-metrics"
              >
                <Stat label={t('detail.metricViews30d')} value={r.views30d.toLocaleString()} />
                <Stat label={t('detail.metricViews14d')} value={views14d.toLocaleString()} />
                <Stat label={t('detail.metricMenus')} value={String(r.menus)} />
                <Stat label={t('detail.metricItems')} value={String(r.items)} />
              </section>

              <SideCard
                title={t('detail.payments')}
                action={{ href: `${detailHref}/payments`, label: t('detail.manage') }}
                data-test-id="admin-restaurant-billing"
              >
                <InfoRow label={t('detail.plan')} value={plan} />
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

              <SideCard
                title={t('detail.qrCode')}
                action={{ href: qrHref, label: t('detail.openQr') }}
                data-test-id="admin-restaurant-qr"
              >
                <p className="text-[13px] text-muted-foreground">{t('detail.qrManaged')}</p>
              </SideCard>
            </TabsContent>

            <TabsContent value="activity">
              <SideCard title={t('detail.auditLog')} data-test-id="admin-restaurant-audit">
                <RestaurantAuditTab restaurantId={r.id} />
              </SideCard>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardPage>
  )
}
