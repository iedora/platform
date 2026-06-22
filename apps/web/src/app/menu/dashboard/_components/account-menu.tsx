'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CreditCard, LogOut, Settings } from 'lucide-react'
import { SidebarMenuItem } from '@iedora/design-system'
import { signOutUrl } from '@iedora/product-menu/shared/auth-urls'
import { UserLocaleSwitcher } from '@iedora/product-menu/features/dashboard-home/ui/user-locale-switcher'

/**
 * Contents of the sidebar account popover (`<SidebarUserCard>` children):
 * quick links to Billing + Settings, the language switcher, and Log out.
 * Lives in apps/web (where lucide-react is available) and composes the
 * shared design-system + product-menu pieces so every dashboard role
 * shares one account menu. Billing/Settings are per-tenant, so the
 * layout hides them for staff without a tenant pinned.
 */
export function AccountMenu({
  showBilling,
  showSettings,
}: {
  showBilling: boolean
  showSettings: boolean
}) {
  const t = useTranslations('AppHeader')

  return (
    <>
      {showBilling ? (
        <SidebarMenuItem asChild>
          <Link href="/menu/dashboard/billing" data-test-id="account-menu-billing">
            <span className="ds-sidebar__menu-icon" aria-hidden="true">
              <CreditCard size={16} strokeWidth={2} />
            </span>
            {t('billing')}
          </Link>
        </SidebarMenuItem>
      ) : null}
      {showSettings ? (
        <SidebarMenuItem asChild>
          <Link href="/menu/dashboard/misc" data-test-id="account-menu-settings">
            <span className="ds-sidebar__menu-icon" aria-hidden="true">
              <Settings size={16} strokeWidth={2} />
            </span>
            {t('settings')}
          </Link>
        </SidebarMenuItem>
      ) : null}

      <div className="ds-sidebar__menu-row">
        <span className="text-[12px] text-[var(--muted-foreground)]">{t('language')}</span>
        <UserLocaleSwitcher />
      </div>

      <SidebarMenuItem
        // Plain href navigation (no fetch) so the sign-out Set-Cookie
        // reaches the browser unwrapped — same flow as LogoutButton.
        onClick={() => window.location.assign(signOutUrl(window.location.origin))}
        data-test-id="account-menu-logout"
      >
        <span className="ds-sidebar__menu-icon" aria-hidden="true">
          <LogOut size={16} strokeWidth={2} />
        </span>
        {t('logout')}
      </SidebarMenuItem>
    </>
  )
}
