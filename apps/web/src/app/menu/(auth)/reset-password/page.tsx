import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { signInUrl } from '@iedora/product-menu/shared/auth-urls'
import { ResetPasswordForm } from './reset-password-form'

type Props = {
  searchParams: Promise<{ token?: string }>
}

/**
 * Reset-password page — set a new password from the emailed link. The
 * opaque token rides in `?token=`; with no token the link is dead, so we
 * show a recovery message instead of the form. RSC shell + client form
 * (submits to `resetPasswordAction`).
 */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const t = await getTranslations('Auth.resetPassword')
  const { token } = await searchParams
  const signInHref = signInUrl()

  return (
    <div>
      <h1 className="font-heading text-[28px] font-extrabold leading-[1.12] tracking-[-0.01em] text-foreground">
        {t('title')}
      </h1>
      <p className="mt-2 text-[15px] leading-[1.5] text-muted-foreground">
        {token ? t('subtitle') : t('invalidLink')}
      </p>
      <div className="mt-7">
        {token ? (
          <ResetPasswordForm token={token} signInHref={signInHref} />
        ) : (
          <Link
            href={signInHref}
            className="inline-flex w-full items-center justify-center rounded-[12px] bg-primary px-4 py-3 text-[16px] font-semibold text-white no-underline transition-colors hover:bg-primary/90"
            data-test-id="reset-back-link"
          >
            {t('backToSignIn')}
          </Link>
        )}
      </div>
    </div>
  )
}
