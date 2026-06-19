import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@iedora/api-client'
import { isSameIedoraOrigin, PRODUCTS, productUrl } from '@iedora/brand'
import { signUpUrl } from '@iedora/product-menu/shared/auth-urls'
import { SignInForm } from './sign-in-form'

type Props = {
  searchParams: Promise<{ next?: string }>
}

/**
 * Sign-in page. RSC shell — resolves the validated `next` URL and the
 * cross-link href on the server (so the client form doesn't recompute
 * `productUrl` and trigger a hydration mismatch), then hands off to the
 * client form (which submits to `signInAction`).
 */
export default async function SignInPage({ searchParams }: Props) {
  const t = await getTranslations('Auth.signIn')
  const { next: rawNext } = await searchParams

  const session = await getSession()
  const next = isSameIedoraOrigin(rawNext) ? rawNext! : productUrl(PRODUCTS.menu)
  if (session) {
    redirect(next)
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--display)] text-[28px] font-extrabold leading-[1.12] tracking-[-0.01em] text-foreground">
        {t('title')}
      </h1>
      <p className="mt-2 text-[15px] leading-[1.5] text-muted-foreground">{t('subtitle')}</p>
      <div className="mt-7">
        <SignInForm next={next} signUpHref={signUpUrl(next)} />
      </div>
    </div>
  )
}
