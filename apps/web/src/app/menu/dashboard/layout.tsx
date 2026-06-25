import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

// Installable PWA scope = /menu/dashboard. Manifest lives in /public so
// it ships as a static asset; icons under /public/icons are shared by
// the manifest entries and the iOS apple-touch link.
export const metadata: Metadata = {
  manifest: '/menu/dashboard/manifest.webmanifest',
  applicationName: 'Iedora Menu',
  appleWebApp: {
    capable: true,
    title: 'Iedora',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#EFE7D7',
}
import {
  ChartBarIcon,
  BookOpenIcon,
  SquaresFourIcon,
  QrCodeIcon,
  GearIcon,
  StorefrontIcon,
  ForkKnifeIcon,
} from '@phosphor-icons/react/ssr'
import { SidebarInset, SidebarProvider } from '@iedora/ui/components/ui/sidebar'
import { signInUrl } from '@iedora/product-menu/shared/auth-urls'
import { publicUrl } from '@iedora/product-menu/shared/url'
import { ONBOARDING_STEPS } from '@iedora/product-menu/features/menu-onboarding'
import { getSession, isStaff } from '@iedora/product-menu/features/auth'
import { listRestaurantsWithCounts } from '@iedora/product-menu/features/dashboard-home'
import { DEFAULT_PLAN, getOrganizationPlan, getPlanDisplay, planHas } from '@iedora/product-menu/features/plans'
import { AppSidebar, type AppNavItem } from '../../../components/app-sidebar'
import { SiteHeader } from '../../../components/site-header'

/** Two-letter initials for the account avatar — word-initials, else first two chars. */
function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  return ((words[0] ?? '?').slice(0, 2) || '?').toUpperCase()
}

export default async function DashboardLayout({
  children,
  breadcrumb,
}: {
  children: React.ReactNode
  /** `@breadcrumb` parallel-route slot — server-rendered trail for the header. */
  breadcrumb: React.ReactNode
}) {
  // Auth gate lives here AND in each page's DAL (`requireActiveOrganization`).
  // Layout-level redirect is OK here because the conditions are uniform
  // across every dashboard descendant: no session → sign-in; session
  // but no active org → onboarding. The per-page DAL guards stay as
  // belt-and-braces (and as the source of truth for testing).
  const navPromise = getTranslations('DashboardNav')
  const session = await getSession()

  if (!session) {
    redirect(signInUrl(publicUrl('/menu/dashboard').toString()))
  }
  // Staff (iedora-admin / iedora-support) are cross-tenant operators;
  // they don't need to belong to a tenant to land on the dashboard.
  const tenantId = session.tenantId
  const isStaffAdmin = isStaff(session)

  if (!tenantId && !isStaffAdmin) {
    redirect(ONBOARDING_STEPS.name.path)
  }
  const [nav, tBilling, plan, restaurants] = await Promise.all([
    navPromise,
    getTranslations('Billing'),
    tenantId ? getOrganizationPlan() : Promise.resolve(DEFAULT_PLAN),
    tenantId
      ? listRestaurantsWithCounts()
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof listRestaurantsWithCounts>>,
        ),
  ])

  // Role/plan-aware nav. Owners get a restaurant-scoped rail (Dashboard /
  // Menu / Analytics / QR / Settings); Menu + QR target the primary
  // restaurant. Staff get the cross-tenant admin rail. The dashboard root
  // uses `exact: true` so it only lights up on the overview itself.
  const icon = { size: 18 } as const
  const primary = restaurants[0]
  const showAnalytics = planHas(plan, 'analytics')
  const navItems: AppNavItem[] = isStaffAdmin
    ? [
        { href: '/menu/dashboard', label: nav('overview'), icon: <SquaresFourIcon {...icon} />, exact: true, testId: 'dashboard-nav-overview' },
        { href: '/menu/dashboard/admin/restaurants', label: nav('restaurants'), icon: <StorefrontIcon {...icon} />, match: ['/menu/dashboard/r'], testId: 'dashboard-nav-admin-restaurants' },
        { href: '/menu/dashboard/admin/qr-codes', label: nav('qrCodes'), icon: <QrCodeIcon {...icon} />, testId: 'dashboard-nav-admin' },
        ...(tenantId ? [{ href: '/menu/dashboard/misc', label: nav('settings'), icon: <GearIcon {...icon} />, testId: 'dashboard-nav-settings' }] : []),
      ]
    : [
        { href: '/menu/dashboard', label: nav('dashboard'), icon: <SquaresFourIcon {...icon} />, exact: true, testId: 'dashboard-nav-overview' },
        ...(primary ? [{ href: `/menu/dashboard/r/${primary.slug}`, label: nav('menu'), icon: <BookOpenIcon {...icon} />, testId: 'dashboard-nav-menu' }] : []),
        ...(showAnalytics ? [{ href: '/menu/dashboard/analytics', label: nav('analytics'), icon: <ChartBarIcon {...icon} />, testId: 'dashboard-nav-analytics' }] : []),
        ...(primary ? [{ href: `/menu/dashboard/r/${primary.slug}/qr`, label: nav('qrCodes'), icon: <QrCodeIcon {...icon} />, testId: 'dashboard-nav-qr' }] : []),
        { href: '/menu/dashboard/misc', label: nav('settings'), icon: <GearIcon {...icon} />, testId: 'dashboard-nav-settings' },
      ]

  // Account card identity. Owners: primary restaurant name + plan display
  // name. Staff: "Admin" + email.
  const planName = tBilling(`plans.${getPlanDisplay(plan.code).code}.name`)
  const emailLocal = session.email?.split('@')[0] ?? ''
  const accountName = isStaffAdmin ? nav('admin') : primary?.name || emailLocal || 'Account'
  const accountSub = isStaffAdmin ? session.email ?? '' : planName

  return (
    <SidebarProvider>
      <AppSidebar
        data-test-id="dashboard-chrome"
        navItems={navItems}
        brand={{
          href: '/menu/dashboard',
          label: 'Iedora',
          glyph: <ForkKnifeIcon size={18} weight="bold" />,
          badge: isStaffAdmin ? nav('admin') : undefined,
        }}
        account={{
          name: accountName,
          sub: accountSub,
          initials: initialsOf(accountName),
          showBilling: Boolean(tenantId),
          showSettings: Boolean(tenantId),
        }}
      />
      <SidebarInset>
        <SiteHeader breadcrumb={breadcrumb} />
        <main className="flex-1 p-4 pb-24 lg:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
