import { getTranslations } from 'next-intl/server'
import { requireRestaurantBySlug } from '@iedora/product-menu/features/auth'
import { loadRestaurantDetail } from '@iedora/product-menu/features/restaurant-identity'
import { loadBuilderData } from '@iedora/product-menu/features/menu-builder'
import { BreadcrumbTrail, type Crumb } from '../trail'

/**
 * Server-rendered breadcrumb for every dashboard sub-route (the `@breadcrumb`
 * parallel-route slot). Rendering the trail here — instead of a client effect
 * that publishes after hydration — keeps the right crumbs in the initial HTML
 * on refresh (no flash, no shift). Names come from the same `cache()`-wrapped
 * loaders the pages use, so resolving them here is deduped (no extra fetch).
 * The bare `/menu/dashboard` index is handled by the sibling `page.tsx`.
 */
export default async function BreadcrumbSlot({
  params,
}: {
  params: Promise<{ rest: string[] }>
}) {
  const { rest } = await params
  return <BreadcrumbTrail items={await resolveCrumbs(rest)} />
}

async function resolveCrumbs(rest: string[]): Promise<Crumb[]> {
  // Admin restaurants tree: Restaurants › {name} › {Edit|Payments|New}
  if (rest[0] === 'admin' && rest[1] === 'restaurants') {
    const t = await getTranslations('Admin')
    const root: Crumb = { label: t('restaurants.title'), href: '/menu/dashboard/admin/restaurants' }
    const id = rest[2]
    if (!id) return [{ label: t('restaurants.title') }]
    if (id === 'new') return [root, { label: t('newRestaurant.title') }]

    const name = await restaurantNameById(id)
    if (!name) return [root, { label: id }]
    const detailHref = `/menu/dashboard/admin/restaurants/${id}`
    if (rest.length === 3) return [root, { label: name }]
    if (rest[3] === 'edit') return [root, { label: name, href: detailHref }, { label: t('edit.eyebrow') }]
    if (rest[3] === 'payments') return [root, { label: name, href: detailHref }, { label: t('payments.title') }]
    return [root, { label: name }]
  }

  // Admin QR registry
  if (rest[0] === 'admin' && rest[1] === 'qr-codes') {
    const t = await getTranslations('Admin')
    return [{ label: t('qrCodes.title') }]
  }

  // Owner restaurant tree: {name} › {section}
  if (rest[0] === 'r' && rest[1]) {
    const slug = rest[1]
    const name = await restaurantNameBySlug(slug)
    if (!name) return []
    const home: Crumb = { label: name, href: `/menu/dashboard/r/${slug}` }
    if (rest.length === 2) return [{ label: name }]
    const tr = await getTranslations('Restaurant')
    if (rest[2] === 'qr') return [home, { label: tr('qrCode') }]
    if (rest[2] === 'theme') return [home, { label: tr('settings') }]
    if (rest[2] === 'm' && rest[3]) {
      const menuName = await menuNameById(slug, rest[3])
      return menuName ? [home, { label: menuName }] : [{ label: name }]
    }
    return [{ label: name }]
  }

  // Top-level owner / shared sections
  if (rest[0] === 'analytics') return [{ label: (await getTranslations('Analytics'))('title') }]
  if (rest[0] === 'billing') return [{ label: (await getTranslations('Billing'))('title') }]
  if (rest[0] === 'misc') return [{ label: (await getTranslations('Misc'))('title') }]

  return []
}

async function restaurantNameById(id: string): Promise<string | null> {
  try {
    return (await loadRestaurantDetail(id)).restaurant.name
  } catch {
    return null
  }
}

async function restaurantNameBySlug(slug: string): Promise<string | null> {
  try {
    return (await requireRestaurantBySlug(slug)).restaurant.name
  } catch {
    return null
  }
}

async function menuNameById(slug: string, menuId: string): Promise<string | null> {
  try {
    return (await loadBuilderData(slug, menuId))?.menu.name ?? null
  } catch {
    return null
  }
}
