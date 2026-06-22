import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
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
  BarChart3,
  BookOpen,
  LayoutDashboard,
  QrCode,
  Settings,
  Store,
  UtensilsCrossed,
} from 'lucide-react'
import {
  ActiveSidebarLinks,
  type ActiveSidebarItem,
  Sidebar,
  SidebarBrand,
  SidebarBrandMark,
  SidebarProvider,
  SidebarUserCard,
} from '@iedora/design-system'
import { signInUrl } from '@iedora/product-menu/shared/auth-urls'
import { publicUrl } from '@iedora/product-menu/shared/url'
import { ONBOARDING_STEPS } from '@iedora/product-menu/features/menu-onboarding'
import { getSession, isStaff } from '@iedora/product-menu/features/auth'
import { listRestaurantsWithCounts } from '@iedora/product-menu/features/dashboard-home'
import { DEFAULT_PLAN, getOrganizationPlan, getPlanDisplay, planHas } from '@iedora/product-menu/features/plans'
import { AccountMenu } from './_components/account-menu'
import { BottomNav, type BottomTab } from './_components/bottom-nav'

/** Two-letter initials for the account avatar — word-initials, else first two chars. */
function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  return ((words[0] ?? '?').slice(0, 2) || '?').toUpperCase()
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Auth gate lives here AND in each page's DAL (`requireActiveOrganization`).
  // Layout-level redirect is OK here because the conditions are uniform
  // across every dashboard descendant: no session → sign-in; session
  // but no active org → onboarding. The per-page DAL guards stay as
  // belt-and-braces (and as the source of truth for testing).
  //
  // Without this gate the dashboard layout would render briefly before
  // the page's `requireActiveOrganization()` redirect fires — flash of
  // empty dashboard chrome on the way to /menu/onboarding. Reported
  // by eduvhc 2026-05-29.
  // Translations + session run concurrently — neither depends on the
  // other. The session read dedupes via React.cache, so the pages'
  // own guards share the same cookie parse.
  const tPromise = getTranslations('AppHeader')
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
  // Staff without a tenant get empty restaurants + the default plan.
  // Translations + session + data run concurrently; reads dedupe via
  // React.cache.
  const [t, nav, tBilling, plan, restaurants] = await Promise.all([
    tPromise,
    navPromise,
    getTranslations('Billing'),
    tenantId ? getOrganizationPlan() : Promise.resolve(DEFAULT_PLAN),
    tenantId
      ? listRestaurantsWithCounts()
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof listRestaurantsWithCounts>>,
        ),
  ])

  // Warm-light icon nav (Pencil "App / Admin Sidebar"). Owners get a
  // restaurant-scoped rail (Dashboard / Menu / Analytics / QR / Settings);
  // Menu + QR target the primary restaurant (the common single-restaurant
  // case). Staff get the cross-tenant admin rail. Account actions (billing,
  // settings, language, logout) live in the bottom user-card popover, not
  // the rail. The dashboard root uses `matchPrefix: false` so it only
  // lights up on the overview itself, never on a nested restaurant page.
  const icon = { size: 20, strokeWidth: 2 } as const
  const primary = restaurants[0]
  // Analytics is plan-gated: the page redirects free plans to billing, so
  // the rail (and the mobile tab) hide the link rather than dead-end there.
  const showAnalytics = planHas(plan, 'analytics')
  const navItems: ActiveSidebarItem[] = isStaffAdmin
    ? [
        { href: '/menu/dashboard', label: nav('overview'), icon: <LayoutDashboard {...icon} />, matchPrefix: false, testId: 'dashboard-nav-overview' },
        { href: '/menu/dashboard/admin/restaurants', label: nav('restaurants'), icon: <Store {...icon} />, testId: 'dashboard-nav-admin-restaurants' },
        { href: '/menu/dashboard/admin/qr-codes', label: nav('qrCodes'), icon: <QrCode {...icon} />, testId: 'dashboard-nav-admin' },
        ...(tenantId ? [{ href: '/menu/dashboard/misc', label: nav('settings'), icon: <Settings {...icon} />, testId: 'dashboard-nav-settings' }] : []),
      ]
    : [
        { href: '/menu/dashboard', label: nav('dashboard'), icon: <LayoutDashboard {...icon} />, matchPrefix: false, testId: 'dashboard-nav-overview' },
        ...(primary ? [{ href: `/menu/dashboard/r/${primary.slug}`, label: nav('menu'), icon: <BookOpen {...icon} />, testId: 'dashboard-nav-menu' }] : []),
        ...(showAnalytics ? [{ href: '/menu/dashboard/analytics', label: nav('analytics'), icon: <BarChart3 {...icon} />, testId: 'dashboard-nav-analytics' }] : []),
        ...(primary ? [{ href: `/menu/dashboard/r/${primary.slug}/qr`, label: nav('qrCodes'), icon: <QrCode {...icon} />, testId: 'dashboard-nav-qr' }] : []),
        { href: '/menu/dashboard/misc', label: nav('settings'), icon: <Settings {...icon} />, testId: 'dashboard-nav-settings' },
      ]

  // Bottom user-card identity. Owners: primary restaurant name + plan
  // display name (i18n single source). Staff: "Admin" + email.
  const planName = tBilling(`plans.${getPlanDisplay(plan.code).code}.name`)
  const emailLocal = session.email?.split('@')[0] ?? ''
  // `||` (not `??`) so an empty restaurant name / empty email-local falls
  // through to the next option instead of rendering a blank card.
  const accountName = isStaffAdmin ? nav('admin') : primary?.name || emailLocal || 'Account'
  const accountSub = isStaffAdmin ? session.email ?? '' : planName

  // Mobile bottom tab bar (Pencil has no top-right drawer below `lg`). The
  // sidebar rail carries the full nav on desktop; this curates the top
  // destinations per role. Account actions live behind the sidebar's user
  // card on desktop and the Settings tab on mobile.
  const bottomCandidates: ReadonlyArray<BottomTab | false> = isStaffAdmin
    ? [
        { href: '/menu/dashboard', label: nav('overview'), icon: 'overview', exact: true },
        { href: '/menu/dashboard/admin/restaurants', label: nav('restaurants'), icon: 'restaurants' },
        { href: '/menu/dashboard/admin/qr-codes', label: nav('qrCodes'), icon: 'qr' },
        Boolean(tenantId) && { href: '/menu/dashboard/misc', label: nav('settings'), icon: 'settings' },
      ]
    : [
        { href: '/menu/dashboard', label: nav('dashboard'), icon: 'home', exact: true },
        primary ? { href: `/menu/dashboard/r/${primary.slug}`, label: nav('menu'), icon: 'menu' } : false,
        showAnalytics && { href: '/menu/dashboard/analytics', label: nav('analytics'), icon: 'stats' },
        Boolean(tenantId) && { href: '/menu/dashboard/misc', label: nav('settings'), icon: 'settings' },
      ]
  const bottomTabs = bottomCandidates.filter((x): x is BottomTab => Boolean(x))

  return (
    <SidebarProvider>
      <div className="flex min-h-screen flex-col bg-[var(--background)] lg:flex-row">
        {/* Desktop nav is the sidebar rail (lg+); below `lg` the sidebar
            stays off-canvas and the BottomNav below carries navigation —
            no hamburger drawer, matching the Pencil mobile chrome. */}
        <Sidebar aria-label={nav('ariaLabel')} data-test-id="dashboard-chrome">
          <SidebarBrand>
            <Link
              href="/menu/dashboard"
              aria-label={t('brandHome')}
              data-test-id="dashboard-home-link"
            >
              <SidebarBrandMark
                glyph={<UtensilsCrossed size={18} strokeWidth={2.2} />}
                badge={isStaffAdmin ? nav('admin') : undefined}
              />
            </Link>
          </SidebarBrand>

          {/* `ActiveSidebarLinks` is a tiny client island over
              `<SidebarLinks>` — reads `usePathname()` once and maps
              to `<SidebarLink asChild active=…><Link/></SidebarLink>`
              so client-side routing + prefetch stay intact AND the
              cinnabar rail lights the right item. */}
          <ActiveSidebarLinks ariaLabel={nav('ariaLabel')} items={navItems} />

          {/* Bottom account card — name + plan (owner) / email (staff)
              with a popover for billing, settings, language, logout. */}
          <SidebarUserCard
            initials={initialsOf(accountName)}
            name={accountName}
            sub={accountSub}
            menuLabel={t('accountMenu')}
          >
            <AccountMenu
              showBilling={Boolean(tenantId)}
              showSettings={Boolean(tenantId)}
            />
          </SidebarUserCard>
        </Sidebar>

        <main className="ds-shell flex-1 pt-5 pb-24 sm:pt-7 lg:pt-8 lg:pb-16">
          {children}
        </main>

        <BottomNav tabs={bottomTabs} />
      </div>
    </SidebarProvider>
  )
}
