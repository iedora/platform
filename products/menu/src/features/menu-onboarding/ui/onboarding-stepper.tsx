'use client'

import { useTranslations } from 'next-intl'
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_KEYS,
  ONBOARDING_STEP_TOTAL,
  type OnboardingStepKey,
} from '../steps'

/**
 * Two-step indicator rendered at the top of both onboarding pages.
 * The current step is `accent`; prior steps are `done`; later steps
 * are `pending`. Reads label keys from `steps.ts` so adding step 3
 * is a one-file change.
 *
 * Client component because step 2 already renders inside a `'use
 * client'` tree (`MenuOnboardingPage`). React supports server-side
 * rendering of client components, so step 1 (RSC) can mount it too
 * without ceremony.
 */
export function OnboardingStepper({
  current,
}: {
  current: OnboardingStepKey
}) {
  const t = useTranslations()
  const currentIndex = ONBOARDING_STEPS[current].index
  const counterLabel = t('Onboarding.steps.counter', {
    index: currentIndex,
    total: ONBOARDING_STEP_TOTAL,
  })
  return (
    <ol
      className="flex flex-col items-center gap-3"
      aria-label={t('Onboarding.steps.label')}
      data-test-id="onboarding-stepper"
    >
      <li
        className="font-[family-name:var(--mono)] text-[10.5px] uppercase tracking-[0.18em] text-[var(--ink-55)]"
        data-test-id="onboarding-stepper-counter"
      >
        {counterLabel}
      </li>
      <li className="flex items-center gap-3">
        {ONBOARDING_STEP_KEYS.map((key, i) => {
          const state =
            key === current
              ? 'current'
              : ONBOARDING_STEPS[key].index < currentIndex
                ? 'done'
                : 'pending'
          return (
            <span
              key={key}
              className="flex items-center gap-3"
              data-test-id={`onboarding-stepper-step-${key}`}
              data-state={state}
            >
              <span
                className={
                  state === 'current'
                    ? 'inline-block h-1.5 w-6 bg-[var(--cinnabar)]'
                    : state === 'done'
                      ? 'inline-block h-1.5 w-6 bg-[var(--ink)]'
                      : 'inline-block h-1.5 w-6 bg-[var(--ink-14)]'
                }
                aria-hidden="true"
              />
              <span
                className={
                  state === 'current'
                    ? 'text-[11px] uppercase tracking-[0.18em] text-[var(--ink)]'
                    : 'text-[11px] uppercase tracking-[0.18em] text-[var(--ink-55)]'
                }
              >
                {t(ONBOARDING_STEPS[key].labelKey)}
              </span>
              {i < ONBOARDING_STEP_KEYS.length - 1 ? (
                <span aria-hidden="true" className="text-[var(--ink-22)]">
                  ·
                </span>
              ) : null}
            </span>
          )
        })}
      </li>
    </ol>
  )
}
