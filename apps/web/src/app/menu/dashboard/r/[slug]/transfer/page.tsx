import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { hasScope } from '@iedora/auth/server'
import { SCOPES } from '@iedora/auth/scopes'
import { requireRestaurantBySlug } from '@iedora/product-menu/features/auth'
import { getRestaurantTransferContext } from '@iedora/product-menu/features/restaurant-identity'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { TransferContextSummary } from './transfer-context-summary'
import { TransferWizard } from './transfer-wizard'

/**
 * Admin-driven transfer entry. Gated by both the slug guard (caller
 * must belong to the source tenant) AND the cross-tenant staff scope
 * (caller must hold `staff:menu:restaurants:transfer`). The slug
 * guard alone would let any tenant owner reassign their own
 * restaurant; the extra scope reserves this surface for iedora-admin.
 *
 * Renders inside the standard dashboard shell so the breadcrumb +
 * vertical rhythm match every other admin screen.
 */
export default async function TransferPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Restaurant lookup, scope check, and i18n are independent — fan them
  // out instead of awaiting in series.
  const [{ restaurant: r }, allowed, t, locale] = await Promise.all([
    requireRestaurantBySlug(slug),
    hasScope(SCOPES.menu.staff.restaurants.transfer),
    getTranslations('RestaurantTransfer'),
    getLocale(),
  ])
  if (!allowed) notFound()
  // Context needs r.id, so it chains after the restaurant resolves.
  const context = await getRestaurantTransferContext(r.id)

  return (
    <DashboardPage
      title={t('title', { name: r.name })}
      eyebrow={t('eyebrow')}
      description={t('description')}
      crumbs={[
        { label: t('crumbRestaurant'), href: `/menu/dashboard/r/${slug}` },
      ]}
      data-test-id="restaurant-transfer"
    >
      {context && <TransferContextSummary context={context} locale={locale} />}
      <TransferWizard slug={slug} restaurantName={r.name} />
    </DashboardPage>
  )
}
