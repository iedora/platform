'use client'

import { useTranslations } from 'next-intl'
import { signOutUrl } from '../../../shared/auth-urls'

/**
 * Full-width "Log out" action for the Settings page (Pencil design).
 * Same sign-out flow as {@link LogoutButton} (plain href navigation so
 * the Set-Cookie clear reaches the browser unwrapped) — just styled as a
 * standalone danger button instead of the sidebar's ghost link.
 */
export function SettingsLogout() {
  const t = useTranslations('AppHeader')
  return (
    <button
      type="button"
      data-test-id="settings-logout"
      onClick={() => window.location.assign(signOutUrl(window.location.origin))}
      className="w-full rounded-[18px] border border-border bg-card px-4 py-3.5 text-[15px] font-semibold text-[#D92D20] transition-colors hover:bg-[#FDECEA]"
    >
      {t('logout')}
    </button>
  )
}
