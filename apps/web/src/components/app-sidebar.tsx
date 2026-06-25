'use client'

import { type ComponentProps, type ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@iedora/ui/components/ui/sidebar'
import { NavUser } from './nav-user'

export type AppNavItem = {
  href: string
  label: string
  icon?: ReactNode
  testId?: string
  /** Match only the exact path (no descendant highlighting). */
  exact?: boolean
  /** Extra path prefixes that also activate this item (e.g. admin Restaurants
   *  staying lit while viewing an owner-scoped restaurant page). */
  match?: string[]
}

export type AppSidebarProps = ComponentProps<typeof Sidebar> & {
  navItems: AppNavItem[]
  brand: { href: string; label: string; glyph: ReactNode; badge?: string }
  account: { name: string; sub: string; initials: string; showBilling: boolean; showSettings: boolean }
}

/**
 * Dashboard sidebar (shady-app `app-sidebar` pattern on the Base UI kit).
 * The server layout computes role/plan-aware nav items + account data and
 * passes them in; active state resolves client-side from the pathname.
 */
export function AppSidebar({ navItems, brand, account, ...props }: AppSidebarProps) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  // On mobile the sidebar is an off-canvas Sheet. Close it on route change
  // (in an effect, after navigation settles) rather than on click, so the
  // Sheet's slide-out animation plays instead of being cut off by the nav.
  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])
  const matchesPrefix = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  const isActive = (item: AppNavItem) =>
    (item.exact ? pathname === item.href : matchesPrefix(item.href)) ||
    (item.match?.some(matchesPrefix) ?? false)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href={brand.href} data-test-id="dashboard-home-link" />}
            >
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                {brand.glyph}
              </span>
              <span className="truncate text-base font-semibold">{brand.label}</span>
              {brand.badge ? (
                <span className="ml-auto text-xs text-muted-foreground uppercase">{brand.badge}</span>
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isActive(item)}
                    tooltip={item.label}
                    render={<Link href={item.href} data-test-id={item.testId} />}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser {...account} />
      </SidebarFooter>
    </Sidebar>
  )
}
