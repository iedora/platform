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
    <div className="flex min-h-screen flex-col bg-[var(--paper)]">
      <div
        className="ds-shell flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-6 font-[family-name:var(--mono)] text-[10.5px] uppercase tracking-[0.18em] text-[var(--ink-55)] sm:pt-9"
        style={{ maxWidth: 1100 }}
      >
        <div className="flex items-center gap-3">
          <span>MMXXVI</span>
          <span aria-hidden="true">·</span>
          <span>Menu · Onboarding</span>
        </div>
        <Link href="/menu/dashboard" className="no-underline">
          Dashboard
        </Link>
      </div>

      <main className="ds-shell flex flex-1 items-center justify-center py-12 sm:py-16">
        <div className="w-full max-w-[560px]">
          <div className="mb-10 flex flex-col items-center gap-4 text-center sm:mb-12">
            <Link
              href="/"
              className="inline-flex items-baseline no-underline"
              aria-label="Menu home"
            >
              <Wordmark
                word="menu"
                variant="display"
                className="ds-wordmark--reveal"
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
    </div>
  )
}
