'use client'

import { useActionState, useState } from 'react'
import { useForm, getFormProps, getInputProps } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@iedora/design-system'
import { forgotPasswordAction } from '@iedora/product-menu/features/auth/actions'
import { forgotPasswordSchema } from '@iedora/product-menu/features/auth/schemas'
import { TextField } from '../../_components/form-fields'

export function ForgotPasswordForm({ signInHref }: { signInHref: string }) {
  const t = useTranslations('Auth.forgotPassword')
  const tf = useTranslations('Auth.fields')
  const [lastResult, action, pending] = useActionState(forgotPasswordAction, undefined)
  const [form, fields] = useForm({
    lastResult,
    constraint: getZodConstraint(forgotPasswordSchema),
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
    onValidate: ({ formData }) => parseWithZod(formData, { schema: forgotPasswordSchema }),
  })
  // Controlled so the email survives React 19's post-action form reset.
  const [email, setEmail] = useState('')

  const msg = (errs?: string[]) => (errs?.[0] ? tf(errs[0]) : undefined)

  // Neutral confirmation — never reveals whether the address has an account.
  if (lastResult?.status === 'success') {
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

  const { key: emailKey, ...emailProps } = getInputProps(fields.email, { type: 'email', value: false, ariaAttributes: false })

  return (
    <form {...getFormProps(form)} action={action} className="flex flex-col gap-5">
      <TextField
        key={emailKey}
        {...emailProps}
        label={t('emailLabel')}
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('emailPlaceholder')}
        hint={fields.email.errors ? undefined : t('emailHint')}
        error={msg(fields.email.errors)}
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
