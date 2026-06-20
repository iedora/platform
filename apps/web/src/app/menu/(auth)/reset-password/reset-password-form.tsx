'use client'

import * as React from 'react'
import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@iedora/design-system'
import { resetPasswordAction, type ResetFormState } from '@iedora/product-menu/features/auth/actions'
import { PasswordField } from '../../_components/form-fields'
import { PASSWORD_MIN } from '../../_components/validation'

export function ResetPasswordForm({ token, signInHref }: { token: string; signInHref: string }) {
  const t = useTranslations('Auth.resetPassword')
  const tf = useTranslations('Auth.fields')
  const [state, action, pending] = useActionState<ResetFormState, FormData>(resetPasswordAction, {
    error: null,
    done: false,
  })
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(ev.currentTarget)
    const password = String(fd.get('password') ?? '')
    const confirm = String(fd.get('confirm') ?? '')
    const e: { password?: string; confirm?: string } = {}
    if (password.length < PASSWORD_MIN) e.password = tf('passwordMin', { min: PASSWORD_MIN })
    if (confirm !== password) e.confirm = tf('passwordMismatch')
    setErrors(e)
    if (Object.keys(e).length > 0) ev.preventDefault()
  }

  // Success — no auto-login, so route the user to sign in with the new password.
  if (state.done) {
    return (
      <div className="flex flex-col gap-5" data-test-id="reset-done">
        <p className="rounded-[12px] border border-[var(--green)] bg-[var(--green-soft)] px-4 py-3 text-[14px] leading-[1.5] text-[var(--green)]">
          {t('done')}
        </p>
        <Link
          href={signInHref}
          className="inline-flex w-full items-center justify-center rounded-[12px] bg-primary px-4 py-3 text-[16px] font-semibold text-white no-underline transition-colors hover:bg-[var(--cinnabar-deep)]"
          data-test-id="reset-sign-in-cta"
        >
          {t('signInCta')}
        </Link>
      </div>
    )
  }

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <PasswordField
        label={t('passwordLabel')}
        name="password"
        autoComplete="new-password"
        autoFocus
        maxLength={256}
        placeholder={t('passwordPlaceholder')}
        error={errors.password}
        showLabel={tf('showPassword')}
        hideLabel={tf('hidePassword')}
        data-test-id="reset-password"
      />
      <PasswordField
        label={t('confirmLabel')}
        name="confirm"
        autoComplete="new-password"
        maxLength={256}
        error={errors.confirm}
        showLabel={tf('showPassword')}
        hideLabel={tf('hidePassword')}
        data-test-id="reset-confirm"
      />
      {/* Server-side guard (bad/expired token, or a mismatch that slipped past). */}
      {state.error && (
        <p className="text-[13px] text-[#D92D20]" role="alert" data-test-id="reset-error">
          {t(state.error === 'mismatch' ? 'errorMismatch' : 'errorInvalid')}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="!w-full !justify-center"
        disabled={pending}
        data-test-id="reset-submit"
      >
        {pending ? t('submitting') : t('submit')}
      </Button>
      <p className="text-center text-[14px] text-muted-foreground">
        {t('remembered')}{' '}
        <Link href={signInHref} className="font-semibold text-primary no-underline" data-test-id="reset-sign-in-link">
          {t('backToSignIn')}
        </Link>
      </p>
    </form>
  )
}
