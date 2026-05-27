import Link from 'next/link'
import { Wordmark } from '@iedora/design-system'
import { BRAND_URL } from '@iedora/brand'

/**
 * Centered, single-column chrome for the auth flow (sign-in /
 * sign-up / sign-out). Hosts the brand wordmark at the top and a
 * paper-coloured body — every auth page slots a single Card-shaped
 * island into the `<main>`.
 */
export default function CoreAuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--paper)]">
      <header className="border-b border-[var(--ink)]/10 px-6 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href={BRAND_URL} aria-label="iedora">
            <Wordmark variant="inline" />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}
