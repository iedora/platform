'use client'

import { useActionState, useState } from 'react'
import { useForm, getFormProps, getInputProps } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { resetPasswordAction } from '@iedora/product-menu/features/auth/actions'
import { PASSWORD_MIN, resetPasswordSchema } from '@iedora/product-menu/features/auth/schemas'
import { Button } from '@iedora/ui/components/ui/button'
import { PasswordField } from '@iedora/ui/components/field'

export function ResetPasswordForm({ token, signInHref }: { token: string; signInHref: string }) {
  const t = useTranslations('Auth.resetPassword')
  const tf = useTranslations('Auth.fields')
  const [lastResult, action, pending] = useActionState(resetPasswordAction, undefined)
  const [form, fields] = useForm({
    lastResult,
    constraint: getZodConstraint(resetPasswordSchema),
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
    onValidate: ({ formData }) => parseWithZod(formData, { schema: resetPasswordSchema }),
  })
  // Controlled so a server error (bad/expired token) keeps both fields.
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const msg = (errs?: string[]) => (errs?.[0] ? tf(errs[0], { min: PASSWORD_MIN }) : undefined)

  // Success — no auto-login, so route the user to sign in with the new password.
  if (lastResult?.status === 'success') {
    return (
      <div className="flex flex-col gap-5" data-test-id="reset-done">
        <p className="rounded-[12px] border border-green-600 bg-green-100 px-4 py-3 text-[14px] leading-[1.5] text-green-700">
          {t('done')}
        </p>
        <Link
          href={signInHref}
          className="inline-flex w-full items-center justify-center rounded-[12px] bg-primary px-4 py-3 text-[16px] font-semibold text-white no-underline transition-colors hover:bg-primary/90"
          data-test-id="reset-sign-in-cta"
        >
          {t('signInCta')}
        </Link>
      </div>
    )
  }

  const { key: pwKey, ...pwProps } = getInputProps(fields.password, { type: 'password', value: false, ariaAttributes: false })
  const { key: confirmKey, ...confirmProps } = getInputProps(fields.confirm, { type: 'password', value: false, ariaAttributes: false })

  return (
    <form {...getFormProps(form)} action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <PasswordField
        key={pwKey}
        {...pwProps}
        label={t('passwordLabel')}
        autoComplete="new-password"
        autoFocus
        maxLength={256}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t('passwordPlaceholder')}
        hint={fields.password.errors ? undefined : t('passwordHint')}
        error={msg(fields.password.errors)}
        showLabel={tf('showPassword')}
        hideLabel={tf('hidePassword')}
        data-test-id="reset-password"
      />
      <PasswordField
        key={confirmKey}
        {...confirmProps}
        label={t('confirmLabel')}
        autoComplete="new-password"
        maxLength={256}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        hint={fields.confirm.errors ? undefined : t('confirmHint')}
        error={msg(fields.confirm.errors)}
        showLabel={tf('showPassword')}
        hideLabel={tf('hidePassword')}
        data-test-id="reset-confirm"
      />
      {form.errors && (
        <p className="text-[13px] text-[#D92D20]" role="alert" data-test-id="reset-error">
          {msg(form.errors)}
        </p>
      )}
      <Button
        type="submit"
        variant="default"
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
