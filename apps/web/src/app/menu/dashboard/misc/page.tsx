import Link from 'next/link'
import { CaretRightIcon } from '@phosphor-icons/react/ssr'
import { getTranslations } from 'next-intl/server'
import { getSession, requireActiveOrganization } from '@iedora/product-menu/features/auth'
import { getOrganizationPlan } from '@iedora/product-menu/features/plans'
import { DashboardPage } from '@iedora/product-menu/shared/ui/dashboard-page'
import { SettingsLogout } from '@iedora/product-menu/features/dashboard-home/ui/settings-logout'
import { UserLocaleSwitcher } from '@iedora/product-menu/features/dashboard-home/ui/user-locale-switcher'

/**
 * Settings — account + preferences + plan (Pencil "App · Settings").
 * Warm-light card sections. On mobile this is where the Settings
 * bottom-nav tab lands and the only place the account actions
 * (language + sign-out) live below `lg`.
 */
export default async function MiscPage() {
  const orgPromise = requireActiveOrganization()
  const [, t, tBilling, plan, session] = await Promise.all([
    orgPromise,
    getTranslations('Misc'),
    getTranslations('Billing'),
    orgPromise.then(() => getOrganizationPlan()),
    getSession(),
  ])

  const email = session?.email ?? ''
  const initial = (email.trim()[0] ?? '?').toUpperCase()
  // Plan name comes from Billing.plans — the single source the billing page and
  // admin also render — so the settings card can't drift from it.
  const planName = tBilling(`plans.${plan.code}.name`)
  const sectionLabel =
    'px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
  const card = 'rounded-[18px] border border-border bg-card'

  return (
    <DashboardPage title={t('title')} chrome="none" data-test-id="misc">
      <div className="space-y-6" data-test-id="settings">
        <header className="space-y-1">
          <p className="font-heading text-[26px] font-bold leading-tight text-foreground">
            {t('title')}
          </p>
          <p className="text-[15px] text-muted-foreground">{t('subtitle')}</p>
        </header>

        {/* Account */}
        <section className="space-y-2" data-test-id="settings-account">
          <p className={sectionLabel}>{t('account')}</p>
          <div className={`${card} flex items-center gap-3 p-4`}>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-[18px] font-bold text-primary">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-foreground" title={email}>
                {email}
              </p>
              <p className="text-[13px] text-muted-foreground">{t('signedIn')}</p>
            </div>
          </div>
        </section>

        {/* Preferences */}
        <section className="space-y-2" data-test-id="settings-preferences">
          <p className={sectionLabel}>{t('preferences')}</p>
          <div className={`${card} flex items-center justify-between gap-3 p-4`}>
            <span className="text-[15px] text-foreground">{t('language')}</span>
            <UserLocaleSwitcher />
          </div>
        </section>

        {/* Plan */}
        <section className="space-y-2" data-test-id="settings-plan">
          <p className={sectionLabel}>{t('plan')}</p>
          <div className={`${card} divide-y divide-border`}>
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-foreground">{planName}</p>
                <p className="text-[13px] text-muted-foreground">{t('planHint')}</p>
              </div>
              <Link
                href="/dashboard/billing"
                className="shrink-0 rounded-full bg-primary px-4 py-2 text-[13.5px] font-semibold text-white no-underline transition-colors hover:bg-primary/90"
              >
                {t('manage')}
              </Link>
            </div>
            <Link
              href="/dashboard/billing"
              className="flex items-center justify-between gap-3 p-4 text-foreground no-underline transition-colors hover:bg-muted"
            >
              <span className="text-[15px]">{t('billing')}</span>
              <CaretRightIcon size={18} className="shrink-0 text-muted-foreground" />
            </Link>
          </div>
        </section>

        <SettingsLogout />
      </div>
    </DashboardPage>
  )
}
