import Link from 'next/link'
import { Wordmark } from '@iedora/design-system'
import { BRAND_URL } from '@iedora/brand'

/**
 * Centered, single-column chrome for the auth flow (sign-in /
 * sign-up / sign-out). No navbar — the brand wordmark sits above
 * the card so the page stays focused on the form, uniform with the
 * onboarding shell.
 */
export default function CoreAuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen justify-center bg-[var(--paper)] px-6 pb-12 pt-[max(2rem,env(safe-area-inset-top))] sm:pt-16">
      <div className="w-full max-w-md space-y-6 sm:space-y-8">
        <div className="flex justify-center">
          <Link
            href={BRAND_URL}
            aria-label="iedora"
            className="inline-flex items-baseline no-underline"
          >
            <Wordmark variant="inline" />
          </Link>
        </div>
        {children}
      </div>
    </main>
  )
}
