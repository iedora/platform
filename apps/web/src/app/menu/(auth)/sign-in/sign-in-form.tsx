'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@iedora/design-system'
import { signInAction, type AuthFormState } from '@iedora/product-menu/features/auth/actions'

const FIELD =
  'w-full rounded-[12px] border border-border bg-card px-4 py-3 text-[16px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cinnabar)_22%,transparent)]'
const LABEL = 'mb-1.5 block text-[14px] font-semibold text-foreground'

export function SignInForm({ next, signUpHref }: { next: string; signUpHref: string }) {
  const t = useTranslations('Auth.signIn')
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signInAction,
    { error: null },
  )

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className={LABEL}>{t('emailLabel')}</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          placeholder={t('emailPlaceholder')}
          className={FIELD}
          data-test-id="sign-in-email"
        />
      </div>
      <div>
        <label htmlFor="password" className={LABEL}>{t('passwordLabel')}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
          className={FIELD}
          data-test-id="sign-in-password"
        />
      </div>
      {state.error && (
        <p className="text-[13px] text-[var(--danger)]" role="alert">
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
