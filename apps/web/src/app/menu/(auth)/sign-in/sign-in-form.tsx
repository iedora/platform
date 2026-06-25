'use client'

import { useActionState, useEffect, useState } from 'react'
import { useForm, getFormProps, getInputProps } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@iedora/ui/components/ui/button'
import { signInAction } from '@iedora/product-menu/features/auth/actions'
import { signInSchema } from '@iedora/product-menu/features/auth/schemas'
import { PasswordField, TextField } from '@iedora/ui/components/field'

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
  const [lastResult, action, pending] = useActionState(signInAction, undefined)
  // On success the action has set the auth cookies; do a full-page navigation
  // (not a soft router push) so the destination's first render always carries
  // them — avoids the transient "something went wrong" that an F5 used to fix.
  const redirecting = lastResult?.status === 'success'
  useEffect(() => {
    if (redirecting) window.location.assign(next)
  }, [redirecting, next])
  const [form, fields] = useForm({
    lastResult,
    constraint: getZodConstraint(signInSchema),
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
    onValidate: ({ formData }) => parseWithZod(formData, { schema: signInSchema }),
  })

  // Controlled inputs so a failed sign-in keeps the email + password the user
  // typed (React 19 resets the form action otherwise). See the sign-up form
  // for the full rationale.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const msg = (errs?: string[]) => (errs?.[0] ? tf(errs[0]) : undefined)

  const { key: emailKey, ...emailProps } = getInputProps(fields.email, { type: 'email', value: false, ariaAttributes: false })
  const { key: pwKey, ...pwProps } = getInputProps(fields.password, { type: 'password', value: false, ariaAttributes: false })

  return (
    <form {...getFormProps(form)} action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <TextField
        key={emailKey}
        {...emailProps}
        label={t('emailLabel')}
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('emailPlaceholder')}
        hint={fields.email.errors ? undefined : tf('emailHint')}
        error={msg(fields.email.errors)}
        data-test-id="sign-in-email"
      />
      <div>
        <PasswordField
          key={pwKey}
          {...pwProps}
          label={t('passwordLabel')}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={msg(fields.password.errors)}
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
      {form.errors && (
        <p className="text-[13px] text-[#D92D20]" role="alert">
          {msg(form.errors)}
        </p>
      )}
      <Button
        type="submit"
        variant="default"
        size="lg"
        className="!w-full !justify-center"
        disabled={pending || redirecting}
        data-test-id="sign-in-submit"
      >
        {pending || redirecting ? t('submitting') : t('submit')}
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
