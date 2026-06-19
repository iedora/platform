'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@iedora/design-system'
import { signUpAction, type AuthFormState } from '@iedora/product-menu/features/auth/actions'

const FIELD =
  'w-full rounded-[12px] border border-border bg-card px-4 py-3 text-[16px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-[color-mix(in_srgb,var(--cinnabar)_22%,transparent)]'
const LABEL = 'mb-1.5 block text-[14px] font-semibold text-foreground'

export function SignUpForm({ next, signInHref }: { next: string; signInHref: string }) {
  const t = useTranslations('Auth.signUp')
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signUpAction,
    { error: null },
  )

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="name" className={LABEL}>{t('nameLabel')}</label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          autoFocus
          placeholder={t('namePlaceholder')}
          className={FIELD}
          data-test-id="sign-up-name"
        />
      </div>
      <div>
        <label htmlFor="email" className={LABEL}>{t('emailLabel')}</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t('emailPlaceholder')}
          className={FIELD}
          data-test-id="sign-up-email"
        />
      </div>
      <div>
        <label htmlFor="password" className={LABEL}>{t('passwordLabel')}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={256}
          className={FIELD}
          data-test-id="sign-up-password"
        />
        <p className="mt-1.5 text-[13px] text-muted-foreground">{t('passwordHint')}</p>
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
