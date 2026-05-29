import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@iedora/design-system'
import {
  getEffectiveOrganizationId,
  getSession,
} from '@iedora/product-menu/features/auth'
import {
  ADD_ANOTHER_QUERY_KEY,
  ADD_ANOTHER_QUERY_VALUE,
  ONBOARDING_STEPS,
  OnboardingStepper,
  findPendingOnboardingRestaurant,
  tenantHasRestaurant,
} from '@iedora/product-menu/features/menu-onboarding'
import { signInUrl } from '@iedora/product-core/url'
import { publicUrl } from '@iedora/product-menu/shared/url'
import { OnboardingForm } from './onboarding-form'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const session = await getSession()
  if (!session?.user) redirect(signInUrl(publicUrl(ONBOARDING_STEPS.name.path).toString()))

  const sp = (await searchParams) ?? {}
  const addAnotherRaw = sp[ADD_ANOTHER_QUERY_KEY]
  const addAnother =
    (Array.isArray(addAnotherRaw) ? addAnotherRaw[0] : addAnotherRaw) ===
    ADD_ANOTHER_QUERY_VALUE

  // Tier the gate by the active tenant's state:
  //   - no tenant pinned             → first-time user, render step 1
  //   - tenant has a pending wizard  → resume into step 2 (back-nav protection)
  //   - tenant has only completions  → no orphan entry: bounce to dashboard
  //                                    unless the operator explicitly opted in
  //                                    via the dashboard CTA (`?addAnother=1`)
  const tenantId = await getEffectiveOrganizationId()
  if (tenantId) {
    const pending = await findPendingOnboardingRestaurant(tenantId)
    if (pending)
      redirect(ONBOARDING_STEPS.menu.buildPath({ slug: pending.slug }))
    if (!addAnother && (await tenantHasRestaurant(tenantId))) {
      redirect('/menu/dashboard')
    }
  }

  return (
    <main className="flex justify-center bg-[var(--paper)] px-6 pb-12 pt-[max(2rem,env(safe-area-inset-top))] sm:pb-16 sm:pt-16">
      <div className="w-full max-w-[560px] space-y-8 sm:space-y-10">
        <div className="flex flex-col items-center gap-3 text-center sm:gap-4">
          <Link
            href="/"
            className="inline-flex items-baseline no-underline"
            aria-label="Menu home"
          >
            <Wordmark
              word="menu"
              variant="display"
              className="ds-wordmark--reveal text-[44px] sm:text-[length:var(--t-display)]"
            />
          </Link>
          <span
            className="text-[17px] italic text-[var(--ink-70)]"
            style={{ fontFamily: 'var(--serif)' }}
          >
            name the room
          </span>
          <OnboardingStepper current="name" />
        </div>
        <OnboardingForm />
      </div>
    </main>
  )
}
