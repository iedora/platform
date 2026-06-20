'use client'

import * as React from 'react'
import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@iedora/design-system'
import { signInAction, type AuthFormState } from '@iedora/product-menu/features/auth/actions'
import { PasswordField, TextField } from '../../_components/form-fields'
import { isEmail } from '../../_components/validation'

export function SignInForm({
  next,
  signUpHref,
  forgotHref,
}: {
  next: string
  signUpHref: string
  forgotHref: string
}) {
  const t = useTranslations('Auth.signIn')
  const tf = useTranslations('Auth.fields')
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signInAction, { error: null })
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  function validate(fd: FormData) {
    const e: { email?: string; password?: string } = {}
    const email = String(fd.get('email') ?? '').trim()
    const password = String(fd.get('password') ?? '')
    if (!email) e.email = tf('emailRequired')
    else if (!isEmail(email)) e.email = tf('emailInvalid')
    if (!password) e.password = tf('passwordRequired')
    return e
  }

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    const e = validate(new FormData(ev.currentTarget))
    setErrors(e)
    if (Object.keys(e).length > 0) ev.preventDefault()
  }

  return (
    <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <TextField
        label={t('emailLabel')}
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        placeholder={t('emailPlaceholder')}
        error={errors.email}
        data-test-id="sign-in-email"
      />
      <div>
        <PasswordField
          label={t('passwordLabel')}
          name="password"
          autoComplete="current-password"
          error={errors.password}
          showLabel={tf('showPassword')}
          hideLabel={tf('hidePassword')}
          data-test-id="sign-in-password"
        />
        <div className="mt-1.5 text-right">
          <Link
            href={forgotHref}
            className="text-[13px] font-semibold text-primary no-underline"
            data-test-id="sign-in-forgot-link"
          >
            {t('forgotPassword')}
          </Link>
        </div>
      </div>
      {state.error && (
        <p className="text-[13px] text-[#D92D20]" role="alert">
          {t('errorGeneric')}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="!w-full !justify-center"
        disabled={pending}
        data-test-id="sign-in-submit"
      >
        {pending ? t('submitting') : t('submit')}
      </Button>
      <p className="text-center text-[14px] text-muted-foreground">
        {t('noAccount')}{' '}
        <Link href={signUpHref} className="font-semibold text-primary no-underline" data-test-id="sign-in-sign-up-link">
          {t('signUpLink')}
        </Link>
      </p>
    </form>
  )
}
