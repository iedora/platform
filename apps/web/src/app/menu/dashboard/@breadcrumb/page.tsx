import { getTranslations } from 'next-intl/server'
import { getSession, isStaff } from '@iedora/product-menu/features/auth'
import { BreadcrumbTrail } from './trail'

/**
 * Breadcrumb for the dashboard index (`/menu/dashboard`). The catch-all slot
 * only matches sub-routes, so the bare index needs its own slot page. Mirrors
 * the sidebar's root label: "Overview" for staff, "Dashboard" for owners.
 */
export default async function BreadcrumbIndex() {
  const [session, nav] = await Promise.all([getSession(), getTranslations('DashboardNav')])
  return <BreadcrumbTrail items={[{ label: isStaff(session) ? nav('overview') : nav('dashboard') }]} />
}
