import Link from 'next/link'
import { Button } from '@iedora/ui/components/ui/button'

/**
 * Global 404 (App Router `not-found`): rendered for unmatched routes across
 * every surface and whenever a segment calls `notFound()` without a closer
 * not-found boundary. Wrapped by the root layout, so it inherits fonts/theme.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="mt-3 font-heading text-2xl font-bold">This page does not exist</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be broken, or the page may have moved.
        </p>
        <Button render={<Link href="/" />} className="mt-6">
          Back to home
        </Button>
      </div>
    </main>
  )
}
