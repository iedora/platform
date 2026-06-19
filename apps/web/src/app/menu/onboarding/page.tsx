import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getSession, isStaff } from '@iedora/product-menu/features/auth'
import { LANGUAGE_META } from '@iedora/product-menu/features/i18n'
import {
  ADD_ANOTHER_QUERY_KEY,
  ADD_ANOTHER_QUERY_VALUE,
  ONBOARDING_STEPS,
  tenantHasRestaurant,
} from '@iedora/product-menu/features/menu-onboarding'
import { signInUrl } from '@iedora/product-menu/shared/auth-urls'
import { publicUrl } from '@iedora/product-menu/shared/url'
import { OnboardingForm } from './onboarding-form'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Onboarding — a single step. Collects the restaurant name, public URL
 * preview and languages, then creates the restaurant + one empty menu
 * and drops the owner straight into the menu editor (see `actions.ts`).
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const session = await getSession()
  if (!session) redirect(signInUrl(publicUrl(ONBOARDING_STEPS.name.path).toString()))

  // Staff bypass: iedora-admin / iedora-support never need to onboard
  // a tenant of their own — the dashboard is cross-tenant for them.
  if (isStaff(session)) redirect('/menu/dashboard')

  const sp = (await searchParams) ?? {}
  const addAnotherRaw = sp[ADD_ANOTHER_QUERY_KEY]
  const addAnother =
    (Array.isArray(addAnotherRaw) ? addAnotherRaw[0] : addAnotherRaw) ===
    ADD_ANOTHER_QUERY_VALUE

  // A tenant that already has a restaurant goes to the dashboard, unless
  // they explicitly opted into adding another (`?addAnother=1`).
  if (session.tenantId && !addAnother && (await tenantHasRestaurant())) {
    redirect('/menu/dashboard')
  }

  const locale = await getLocale()
  const languages = LANGUAGE_META.map((l) => ({ code: l.code, label: l.nativeName }))

  return (
    <div className="min-h-screen bg-background text-foreground" data-test-id="onboarding-name-page">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-8 pt-12">
        <OnboardingForm languages={languages} locale={locale} />
      </div>
    </div>
  )
}
