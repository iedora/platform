import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireStaff } from '@iedora/product-menu/features/auth'
import { loadRestaurantDetail } from '@iedora/product-menu/features/restaurant-identity'
import { AdminRenameForm } from '@iedora/product-menu/features/restaurant-identity/ui/admin-rename-form'
import { ApiError } from '@iedora/api-client'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import {
  AdminButton,
  AdminCard,
  AuditList,
  InfoRow,
  formatDate,
} from '../../_components/admin-detail'

/**
 * Admin restaurant edit (`/menu/dashboard/admin/restaurants/[id]/edit`).
 *
 * Staff may override the friendly name here (audited, cross-tenant). Menu
 * content editing and JSON import stay owner-scoped (the restaurant's own
 * builder, gated to its tenant), so they are NOT exposed here. This page shows
 * the editable name, the slug, the full audit trail, and a public preview link.
 */
export default async function AdminRestaurantEditPage({
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

  const { restaurant: r, audit } = detail
  const t = await getTranslations('Admin')

  return (
    <DashboardPage
      title={r.name}
      eyebrow={t('edit.eyebrow')}
      description={`/m/${r.slug}`}
      data-test-id="admin-restaurant-edit"
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <AdminButton href={`/menu/dashboard/admin/restaurants/${r.id}`}>
          ← {t('edit.backRestaurant')}
        </AdminButton>
        <AdminButton href={`/menu/r/${r.slug}`} target="_blank" rel="noopener">
          {t('edit.previewPublic')}
        </AdminButton>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <AdminCard title={t('edit.auditLog')} data-test-id="admin-edit-audit">
          <AuditList events={audit} />
        </AdminCard>

        <div className="grid content-start gap-5">
          <AdminCard title={t('edit.identity')}>
            <AdminRenameForm id={r.id} name={r.name} />
            <div className="mt-3 border-t border-border pt-3">
              <InfoRow label={t('edit.slug')} value={r.slug} mono />
              <InfoRow label={t('edit.created')} value={formatDate(r.createdAt)} />
            </div>
          </AdminCard>

          <AdminCard title={t('edit.menuContent')}>
            <p className="py-2 text-[13px] leading-relaxed text-muted-foreground">
              {t('edit.menuContentBody')}
            </p>
          </AdminCard>
        </div>
      </div>
    </DashboardPage>
  )
}
