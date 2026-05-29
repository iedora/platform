/**
 * Single source of truth for the menu onboarding wizard's step
 * topology. Every page, every redirect, every step indicator reads
 * from here so adding a step is one entry in this file — no magic
 * `1 of 2` strings sprinkled around, no hardcoded href paths.
 *
 * Adding step 3 = add an entry to `ONBOARDING_STEPS`, set `TOTAL`
 * to the new length, point `next` to it from step 2, ship its page
 * at `step.path`. The stepper UI, the resume gate, the back-nav
 * protection — all keep working.
 *
 * Framework-free: no `server-only`, no Next imports. Safe for client
 * and server.
 */

export const ONBOARDING_STEP_KEYS = ['name', 'menu'] as const
export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number]

/** Total step count — derived so the stepper indicator stays in sync. */
export const ONBOARDING_STEP_TOTAL = ONBOARDING_STEP_KEYS.length

type OnboardingStepBase = {
  key: OnboardingStepKey
  /** 1-indexed position for human-readable "Step N of M". */
  index: number
  /** i18n key for the label rendered inside the stepper. */
  labelKey: string
}

type ParameterlessStep = OnboardingStepBase & {
  /** Steps without dynamic params resolve to a static path. */
  path: string
  /** Marks the shape narrowing — `path` is set when this is true. */
  parameterised: false
}

type ParameterisedStep = OnboardingStepBase & {
  /** Steps that need a runtime param (e.g. `:slug`) build their href via this helper. */
  buildPath: (params: { slug: string }) => string
  parameterised: true
}

export type OnboardingStep = ParameterlessStep | ParameterisedStep

/**
 * Per-step metadata. Keep keys in lockstep with `ONBOARDING_STEP_KEYS`
 * — the `satisfies` clause below enforces it at the type level.
 */
export const ONBOARDING_STEPS = {
  name: {
    key: 'name',
    index: 1,
    labelKey: 'Onboarding.steps.name',
    path: '/menu/onboarding',
    parameterised: false,
  },
  menu: {
    key: 'menu',
    index: 2,
    labelKey: 'Onboarding.steps.menu',
    buildPath: ({ slug }: { slug: string }) =>
      `/menu/onboarding/menu/${slug}`,
    parameterised: true,
  },
} as const satisfies Record<OnboardingStepKey, OnboardingStep>

/**
 * Where to send a user who explicitly opts into adding another
 * restaurant from the dashboard. Wraps the step-1 path with the
 * opt-in query flag so the resume gate doesn't bounce them back to
 * a completed wizard.
 */
export const ADD_ANOTHER_QUERY_KEY = 'addAnother' as const
export const ADD_ANOTHER_QUERY_VALUE = '1' as const

export function addAnotherRestaurantHref(): string {
  return `${ONBOARDING_STEPS.name.path}?${ADD_ANOTHER_QUERY_KEY}=${ADD_ANOTHER_QUERY_VALUE}`
}
