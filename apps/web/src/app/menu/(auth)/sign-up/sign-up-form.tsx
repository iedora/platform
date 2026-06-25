'use client'

import { useActionState, useEffect, useState } from 'react'
import { useForm, getFormProps, getInputProps } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@iedora/ui/components/ui/button'
import { signUpAction } from '@iedora/product-menu/features/auth/actions'
import { PASSWORD_MIN, signUpSchema } from '@iedora/product-menu/features/auth/schemas'
import { PasswordField, TextField } from '@iedora/ui/components/field'

export function SignUpForm({ next, signInHref }: { next: string; signInHref: string }) {
  const t = useTranslations('Auth.signUp')
  const tf = useTranslations('Auth.fields')
  const [lastResult, action, pending] = useActionState(signUpAction, undefined)
  // On success the action has set the auth cookies; do a full-page navigation
  // (not a soft router push) so the destination's first render always carries
  // them — avoids the transient "something went wrong" that an F5 used to fix.
  const redirecting = lastResult?.status === 'success'
  useEffect(() => {
    if (redirecting) window.location.assign(next)
  }, [redirecting, next])
  // Conform runs the SAME Zod schema on the client (onValidate) and the server
  // (the action), and maps the action's field/form errors back here — no
  // hand-rolled validate(), no client/server drift.
  const [form, fields] = useForm({
    lastResult,
    constraint: getZodConstraint(signUpSchema),
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
    onValidate: ({ formData }) => parseWithZod(formData, { schema: signUpSchema }),
  })

  // Controlled inputs (state, not Conform's uncontrolled defaultValue): React
  // 19 resets a `<form action>` after the action returns, which wipes
  // uncontrolled fields — backing them with state keeps what the user typed
  // when sign-up fails. `getInputProps({ value: false })` omits Conform's
  // defaultValue so it doesn't fight the controlled value.
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Resolve a field/form error KEY through next-intl (Auth.fields.<key>).
  // `min` is passed for the `passwordMin` message; harmless for the rest.
  const msg = (errs?: string[]) => (errs?.[0] ? tf(errs[0], { min: PASSWORD_MIN }) : undefined)

  const { key: nameKey, ...nameProps } = getInputProps(fields.name, { type: 'text', value: false, ariaAttributes: false })
  const { key: emailKey, ...emailProps } = getInputProps(fields.email, { type: 'email', value: false, ariaAttributes: false })
  const { key: pwKey, ...pwProps } = getInputProps(fields.password, { type: 'password', value: false, ariaAttributes: false })

  return (
    <form {...getFormProps(form)} action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <TextField
        key={nameKey}
        {...nameProps}
        label={t('nameLabel')}
        autoComplete="name"
        autoFocus
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('namePlaceholder')}
        hint={fields.name.errors ? undefined : t('nameHint')}
        error={msg(fields.name.errors)}
        data-test-id="sign-up-name"
      />
      <TextField
        key={emailKey}
        {...emailProps}
        label={t('emailLabel')}
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('emailPlaceholder')}
        hint={fields.email.errors ? undefined : t('emailHint')}
        error={msg(fields.email.errors)}
        data-test-id="sign-up-email"
      />
      <PasswordField
        key={pwKey}
        {...pwProps}
        label={t('passwordLabel')}
        autoComplete="new-password"
        maxLength={256}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={fields.password.errors ? undefined : t('passwordHint')}
        error={msg(fields.password.errors)}
        showLabel={tf('showPassword')}
        hideLabel={tf('hidePassword')}
        data-test-id="sign-up-password"
      />
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
        data-test-id="sign-up-submit"
      >
        {pending || redirecting ? t('submitting') : t('submit')}
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
