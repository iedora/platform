import Link from 'next/link'
import { Button } from '@iedora/ui/components/ui/button'

/**
 * Dashboard 404: rendered when a page calls `notFound()` (e.g. an unknown
 * restaurant id). Lives under the dashboard layout, so the sidebar + header
 * chrome stay in place and the user can keep navigating.
 */
export default function DashboardNotFound() {
  return (
    <div className="grid place-items-center py-20 text-center" data-test-id="dashboard-not-found">
      <div className="max-w-sm">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="mt-3 font-heading text-xl font-bold text-foreground">We could not find that</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have been moved or deleted.</p>
        <Button render={<Link href="/menu/dashboard" />} className="mt-6">
          Back to dashboard
        </Button>
      </div>
    </div>
  )
}
