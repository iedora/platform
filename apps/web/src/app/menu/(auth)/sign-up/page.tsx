import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@iedora/api-client'
import { isSameIedoraOrigin, PRODUCTS, productUrl } from '@iedora/brand'
import { signInUrl } from '@iedora/product-menu/shared/auth-urls'
import { SignUpForm } from './sign-up-form'

type Props = {
  searchParams: Promise<{ next?: string }>
}

export default async function SignUpPage({ searchParams }: Props) {
  const t = await getTranslations('Auth.signUp')
  const { next: rawNext } = await searchParams
  const next = isSameIedoraOrigin(rawNext) ? rawNext! : productUrl(PRODUCTS.menu)

  const session = await getSession()
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
        <SignUpForm next={next} signInHref={signInUrl(next)} />
      </div>
    </div>
  )
}
