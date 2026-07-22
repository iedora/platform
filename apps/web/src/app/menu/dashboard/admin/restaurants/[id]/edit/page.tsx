import Link from 'next/link'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import {
  BookOpen,
  ChevronRight,
  Palette,
  QrCode,
} from 'lucide-react'
import { requireStaff } from '@iedora/product-menu/features/auth'
import { loadRestaurantDetail } from '@iedora/product-menu/features/restaurant-identity'
import { AdminRenameForm } from '@iedora/product-menu/features/restaurant-identity/ui/admin-rename-form'
import { ApiError } from '@iedora/api-client'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { InfoRow, SideCard, formatDate } from '../../_components/admin-detail'

/** One editing-area row in the hub: icon · title · description, links to the
 * owner-scoped surface for this restaurant (staff may edit any restaurant). */
function EditArea({
  href,
  icon,
  title,
  desc,
  testId,
}: {
  href: string
  icon: ReactNode
  title: string
  desc: string
  testId?: string
}) {
  return (
    <Link
      href={href}
      data-test-id={testId}
      className="flex items-center gap-3 rounded-[12px] border border-border bg-card p-3 no-underline transition-colors hover:border-primary/50"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-foreground">{title}</span>
        <span className="block truncate text-[12.5px] text-muted-foreground">{desc}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}

/**
 * Admin restaurant edit (`/menu/dashboard/admin/restaurants/[id]/edit`),
 * staff-only. Staff may edit ANY restaurant top to bottom: rename it here
 * (audited, cross-tenant), and jump into the owner-scoped surfaces —
 * menus, theme, QR — for the full edit. No audit feed here (it lives on
 * the record's Activity tab).
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

  const { restaurant: r } = detail
  const t = await getTranslations('Admin')
  const ownerHref = `/menu/dashboard/r/${r.slug}`

  return (
    <DashboardPage chrome="none" title={r.name} data-test-id="admin-restaurant-edit">
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* Identity — editable name + the read-only attributes. */}
        <SideCard title={t('edit.identity')}>
          <AdminRenameForm id={r.id} name={r.name} />
          <div className="mt-3 border-t border-border pt-3">
            <InfoRow label={t('edit.slug')} value={r.slug} mono />
            <InfoRow label={t('edit.created')} value={formatDate(r.createdAt)} />
          </div>
        </SideCard>

        {/* Edit areas — full access to the restaurant's editing surfaces. */}
        <SideCard title={t('edit.areas')} data-test-id="admin-edit-areas">
          <div className="space-y-2.5">
            <EditArea
              href={ownerHref}
              icon={<BookOpen size={18} />}
              title={t('edit.menus')}
              desc={t('edit.menusDesc')}
              testId="admin-edit-area-menus"
            />
            <EditArea
              href={`${ownerHref}/theme`}
              icon={<Palette size={18} />}
              title={t('edit.theme')}
              desc={t('edit.themeDesc')}
              testId="admin-edit-area-theme"
            />
            <EditArea
              href={`${ownerHref}/qr`}
              icon={<QrCode size={18} />}
              title={t('edit.qr')}
              desc={t('edit.qrDesc')}
              testId="admin-edit-area-qr"
            />
          </div>
        </SideCard>
      </div>
    </DashboardPage>
  )
}
