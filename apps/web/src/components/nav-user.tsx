'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CaretUpDownIcon, CreditCardIcon, GearIcon, SignOutIcon } from '@phosphor-icons/react'
import { Avatar, AvatarFallback } from '@iedora/ui/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@iedora/ui/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@iedora/ui/components/ui/sidebar'
import { signOutUrl } from '@iedora/product-menu/shared/auth-urls'
import { UserLocaleSwitcher } from '@iedora/product-menu/features/dashboard-home/ui/user-locale-switcher'

/**
 * Sidebar footer account control (shady-app `nav-user` pattern, adapted to
 * Base UI's `render` prop). A user button opens a dropdown with Billing /
 * Settings (per-tenant), the language switcher, and Log out.
 */
export function NavUser({
  name,
  sub,
  initials,
  showBilling,
  showSettings,
}: {
  name: string
  sub: string
  initials: string
  showBilling: boolean
  showSettings: boolean
}) {
  const t = useTranslations('AppHeader')

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
                data-test-id="account-menu-trigger"
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">{sub}</span>
                </div>
                <CaretUpDownIcon className="ml-auto size-4" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side="top"
            align="end"
          >
            <DropdownMenuLabel className="font-normal">
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{sub}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {showBilling ? (
              <DropdownMenuItem render={<Link href="/menu/dashboard/billing" />} data-test-id="account-menu-billing">
                <CreditCardIcon className="size-4" />
                {t('billing')}
              </DropdownMenuItem>
            ) : null}
            {showSettings ? (
              <DropdownMenuItem render={<Link href="/menu/dashboard/misc" />} data-test-id="account-menu-settings">
                <GearIcon className="size-4" />
                {t('settings')}
              </DropdownMenuItem>
            ) : null}
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="text-xs text-muted-foreground">{t('language')}</span>
              <UserLocaleSwitcher />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => window.location.assign(signOutUrl(window.location.origin))}
              data-test-id="account-menu-logout"
            >
              <SignOutIcon className="size-4" />
              {t('logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
