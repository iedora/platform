import Link from 'next/link'
import { Utensils } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { brandUrl } from '@iedora/brand'
import { SupportLine } from '../_components/support-line'

/**
 * Warm-light chrome for the auth flow (sign-in / sign-up / sign-out),
 * matching the onboarding screens: paper background, the cutlery brand
 * mark + wordmark up top, and the "Need help? Call us" support line at
 * the bottom. Each page renders its own title + form into the column.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = await getTranslations('Auth')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-8 pt-12">
        <Link href={brandUrl()} aria-label="iedora" className="mb-9 flex items-center gap-2 no-underline">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-white">
            <Utensils size={19} />
          </span>
          <span className="font-[family-name:var(--display)] text-[22px] font-extrabold tracking-[-0.02em] text-foreground">
            iedora
          </span>
        </Link>

        {children}

        <SupportLine label={t('support')} className="mt-auto" testId="auth-support" />
      </div>
    </div>
  )
}
