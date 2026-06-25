'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@iedora/ui/components/ui/button'

/**
 * Dashboard error boundary: catches runtime errors inside the dashboard while
 * keeping the sidebar chrome. `reset()` retries the segment; the link is the
 * way out.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="grid place-items-center py-20 text-center" data-test-id="dashboard-error">
      <div className="max-w-sm">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">Error</p>
        <h1 className="mt-3 font-heading text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We could not load this page. Try again, or go back to the dashboard.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-row items-center justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
          <Button render={<Link href="/menu/dashboard" />}>Dashboard</Button>
        </div>
      </div>
    </div>
  )
}
