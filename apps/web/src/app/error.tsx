'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@iedora/ui/components/ui/button'

/**
 * Root error boundary (App Router `error`): catches unexpected runtime errors
 * in any surface and shows a recoverable fallback. Must be a Client Component.
 * `reset()` re-renders the segment; the home link is the escape hatch.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surfaced to the server logs / error reporter via the digest.
    console.error(error)
  }, [error])

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">Error</p>
        <h1 className="mt-3 font-heading text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. You can try again or head back home.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-row items-center justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
          <Button render={<Link href="/" />}>Back to home</Button>
        </div>
      </div>
    </main>
  )
}
