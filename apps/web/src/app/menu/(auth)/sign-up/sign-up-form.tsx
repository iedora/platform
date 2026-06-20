'use client'

import * as React from 'react'
import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@iedora/design-system'
import { signUpAction, type AuthFormState } from '@iedora/product-menu/features/auth/actions'
import { PasswordField, TextField } from '../../_components/form-fields'
import { PASSWORD_MIN, isEmail } from '../../_components/validation'

export function SignUpForm({ next, signInHref }: { next: string; signInHref: string }) {
  const t = useTranslations('Auth.signUp')
  const tf = useTranslations('Auth.fields')
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUpAction, { error: null })
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({})

  function validate(fd: FormData) {
    const e: { name?: string; email?: string; password?: string } = {}
    const name = String(fd.get('name') ?? '').trim()
    const email = String(fd.get('email') ?? '').trim()
    const password = String(fd.get('password') ?? '')
    if (!name) e.name = tf('nameRequired')
    if (!email) e.email = tf('emailRequired')
    else if (!isEmail(email)) e.email = tf('emailInvalid')
    if (password.length < PASSWORD_MIN) e.password = tf('passwordMin', { min: PASSWORD_MIN })
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
        label={t('nameLabel')}
        name="name"
        type="text"
        autoComplete="name"
        autoFocus
        maxLength={80}
        placeholder={t('namePlaceholder')}
        error={errors.name}
        data-test-id="sign-up-name"
      />
      <TextField
        label={t('emailLabel')}
        name="email"
        type="email"
        autoComplete="email"
        placeholder={t('emailPlaceholder')}
        error={errors.email}
        data-test-id="sign-up-email"
      />
      <PasswordField
        label={t('passwordLabel')}
        name="password"
        autoComplete="new-password"
        maxLength={256}
        hint={errors.password ? undefined : t('passwordHint')}
        error={errors.password}
        showLabel={tf('showPassword')}
        hideLabel={tf('hidePassword')}
        data-test-id="sign-up-password"
      />
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
        data-test-id="sign-up-submit"
      >
        {pending ? t('submitting') : t('submit')}
      </Button>
      <p className="text-center text-[14px] text-muted-foreground">
        {t('haveAccount')}{' '}
        <Link href={signInHref} className="font-semibold text-primary no-underline" data-test-id="sign-up-sign-in-link">
          {t('signInLink')}
        </Link>
      </p>
    </form>
  )
}
