'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Button,
  Card,
  CardDesc,
  CardFoot,
  CardTitle,
  Field,
  FieldInput,
  FieldLabel,
} from '@iedora/design-system'
import { completeOnboarding, type OnboardingFormState } from './actions'

/**
 * Onboarding takes ONE field — the restaurant name. The public URL
 * (slug) is generated server-side from the name with collision suffixes
 * ("sushi-place", "sushi-place-2", …) so the form isn't gating a
 * brand-new operator on choosing a URL. Slug can be changed later from
 * the restaurant settings page.
 *
 * Mobile-first: the card spans the full viewport at <sm and caps at
 * the parent's max-width on tablet+. The CTA goes full-width on mobile
 * (thumb-reach) and shrinks to content on sm+.
 */
export function OnboardingForm() {
  const t = useTranslations('Onboarding')
  const [state, action, pending] = useActionState<OnboardingFormState, FormData>(
    completeOnboarding,
    undefined,
  )
  const [name, setName] = useState('')

  return (
    <Card
      data-test-id="onboarding-form-card"
      className="p-6 sm:p-8"
    >
      <div className="space-y-1.5">
        <span
          className="text-[13px] italic text-[var(--ink-55)]"
          style={{ fontFamily: 'var(--serif)' }}
        >
          {t('eyebrow')}
        </span>
        <CardTitle as="h2">{t('title')}</CardTitle>
        <CardDesc>{t('subtitle')}</CardDesc>
      </div>
      <form action={action} className="mt-6 space-y-6">
        <Field error={Boolean(state?.fieldErrors?.restaurantName)}>
          <FieldLabel htmlFor="restaurantName">{t('restaurantName')}</FieldLabel>
          <FieldInput
            id="restaurantName"
            name="restaurantName"
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('restaurantNamePlaceholder')}
            autoFocus
            data-test-id="onboarding-restaurant-name"
          />
          {state?.fieldErrors?.restaurantName && (
            <p
              className="text-sm text-[var(--cinnabar)]"
              data-test-id="onboarding-field-error"
            >
              {state.fieldErrors.restaurantName}
            </p>
          )}
        </Field>
        {state?.error && (
          <p
            className="text-sm text-[var(--cinnabar)]"
            role="alert"
            data-test-id="onboarding-error"
          >
            {state.error}
          </p>
        )}
        <CardFoot className="border-t border-[var(--ink)]/10 pt-4">
          <Button
            type="submit"
            variant="solid"
            className="w-full sm:w-auto sm:ml-auto"
            disabled={pending}
            data-test-id="onboarding-submit"
          >
            {pending ? t('creating') : t('create')}
          </Button>
        </CardFoot>
      </form>
    </Card>
  )
}
