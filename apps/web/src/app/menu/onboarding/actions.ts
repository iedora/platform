'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { friendlyZodMessage } from '../_components/zod-message'
import { ApiError } from '@iedora/api-client'
import {
  authClient,
  authConfig,
  cookieNames,
  cookieOptions,
  DEFAULT_ACCESS_MAX_AGE,
  DEFAULT_REFRESH_MAX_AGE,
  getAccessToken,
} from '@iedora/auth-sdk/next'
import { getSession } from '@iedora/product-menu/features/auth'
import {
  ONBOARDING_STEPS,
  createOnboardingRestaurant,
  markRestaurantOnboardingComplete,
} from '@iedora/product-menu/features/menu-onboarding'
import { signInUrl } from '@iedora/product-menu/shared/auth-urls'
import { publicUrl } from '@iedora/product-menu/shared/url'

/**
 * Step-1 server action against the services:
 *
 *   1. No tenant on the session yet (first sign-in)? Provision one via
 *      the auth service (`POST /auth/tenants`) with the access token
 *      from the cookie jar.
 *   2. Refresh the token pair so the new access token carries the
 *      tenant id, and persist BOTH cookies (legal here — server
 *      action). `serverFetch` reads `cookies()` per call, so the
 *      restaurant call below already sees the refreshed token.
 *   3. Create the restaurant via the menu service — it owns slug
 *      derivation and the plan gate (422 over-limit → `{ error }`).
 *   4. Redirect into step 2 of the wizard with the slug the service returned.
 *
 * Users who already have a tenant (e.g. "add another restaurant")
 * skip 1–2 and go straight to the plan-gated create.
 */

const onboardingSchema = z.object({
  restaurantName: z.string().trim().min(2).max(80),
  // Menu's primary language (the first chip the owner picks). Falls back
  // to the UI locale. Persisting the full offered set needs a backend update.
  defaultLanguage: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
})

export type OnboardingFormState =
  | { error?: string; fieldErrors?: Partial<Record<keyof z.infer<typeof onboardingSchema>, string>> }
  | undefined

export async function completeOnboarding(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const parsed = onboardingSchema.safeParse({
    restaurantName: formData.get('restaurantName'),
    defaultLanguage: formData.get('defaultLanguage'),
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = friendlyZodMessage(issue)
    }
    return { fieldErrors }
  }

  const { restaurantName, defaultLanguage } = parsed.data
  const signInTarget = signInUrl(
    publicUrl(ONBOARDING_STEPS.name.path).toString(),
  )

  const session = await getSession()
  if (!session) redirect(signInTarget)

  if (!session.tenantId) {
    const store = await cookies()
    const names = cookieNames(authConfig.cookiePrefix)

    // 1. Provision the organization (the owner's first restaurant) in the shared
    //    realm — the caller becomes its owner.
    const accessToken = await getAccessToken()
    if (!accessToken) redirect(signInTarget)
    try {
      await authClient.createOrganization(accessToken, { name: restaurantName })
    } catch (err) {
      console.error('[onboarding] organization creation failed', err)
      return { error: 'Could not create your restaurant workspace. Please try again.' }
    }

    // 2. Rotate the token pair so the access token picks up the new `org` claim,
    //    then persist both SSO cookies. Subsequent `cookies()` reads in this same
    //    action observe the new values.
    const refreshToken = store.get(names.refresh)?.value
    let refreshed
    try {
      refreshed = refreshToken ? await authClient.refresh(refreshToken) : null
    } catch {
      refreshed = null
    }
    if (!refreshed) redirect(signInTarget)
    const opts = cookieOptions(authConfig)
    store.set(names.access, refreshed.accessToken, { ...opts, maxAge: DEFAULT_ACCESS_MAX_AGE })
    store.set(names.refresh, refreshed.refreshToken, { ...opts, maxAge: DEFAULT_REFRESH_MAX_AGE })
  }

  // 3. Create the restaurant (in the owner's chosen primary language)
  //    plus one empty menu. The menu API owns slug derivation and the
  //    plan gate — a 422 over-limit surfaces as the form error.
  let slug: string
  let menuId: string
  try {
    const created = await createOnboardingRestaurant({
      name: restaurantName,
      defaultLanguage: defaultLanguage ?? (await getLocale()),
    })
    slug = created.restaurant.slug
    menuId = created.menuId
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message }
    console.error('[onboarding] restaurant creation failed', err)
    return { error: 'Could not create restaurant. Please try again.' }
  }

  // 4. Onboarding is a single step — mark it complete and drop the
  //    owner straight into the menu editor to add their own dishes.
  try {
    await markRestaurantOnboardingComplete(slug)
  } catch (err) {
    console.error('[onboarding] markComplete failed', err)
  }
  redirect(`/menu/dashboard/r/${slug}/m/${menuId}`)
}
