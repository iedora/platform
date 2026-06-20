'use client'

import * as React from 'react'
import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@iedora/design-system'
import { forgotPasswordAction, type ForgotFormState } from '@iedora/product-menu/features/auth/actions'
import { TextField } from '../../_components/form-fields'
import { isEmail } from '../../_components/validation'

export function ForgotPasswordForm({ signInHref }: { signInHref: string }) {
  const t = useTranslations('Auth.forgotPassword')
  const tf = useTranslations('Auth.fields')
  const [state, action, pending] = useActionState<ForgotFormState, FormData>(forgotPasswordAction, { sent: false })
  const [error, setError] = useState<string | undefined>()

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    const email = String(new FormData(ev.currentTarget).get('email') ?? '').trim()
    const e = !email ? tf('emailRequired') : !isEmail(email) ? tf('emailInvalid') : undefined
    setError(e)
    if (e) ev.preventDefault()
  }

  // Neutral confirmation — never reveals whether the address has an account.
  if (state.sent) {
    return (
      <div className="flex flex-col gap-5" data-test-id="forgot-sent">
        <p className="rounded-[12px] border border-[var(--green)] bg-[var(--green-soft)] px-4 py-3 text-[14px] leading-[1.5] text-[var(--green)]">
          {t('sent')}
        </p>
        <Link
          href={signInHref}
          className="text-center text-[14px] font-semibold text-primary no-underline"
          data-test-id="forgot-back-link"
        >
          {t('backToSignIn')}
        </Link>
      </div>
    )
  }

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <TextField
        label={t('emailLabel')}
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        placeholder={t('emailPlaceholder')}
        error={error}
        data-test-id="forgot-email"
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="!w-full !justify-center"
        disabled={pending}
        data-test-id="forgot-submit"
      >
        {pending ? t('submitting') : t('submit')}
      </Button>
      <p className="text-center text-[14px] text-muted-foreground">
        {t('remembered')}{' '}
        <Link href={signInHref} className="font-semibold text-primary no-underline" data-test-id="forgot-sign-in-link">
          {t('backToSignIn')}
        </Link>
      </p>
    </form>
  )
}
