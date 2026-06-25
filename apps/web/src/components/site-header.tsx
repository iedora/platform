import type { ReactNode } from 'react'
import { Separator } from '@iedora/ui/components/ui/separator'
import { SidebarTrigger } from '@iedora/ui/components/ui/sidebar'

/**
 * Dashboard top bar (shady-app `site-header`): the sidebar toggle, then the
 * current route's breadcrumb. The trail is the server-rendered `@breadcrumb`
 * parallel-route slot (passed in from the layout), so it's in the initial HTML
 * with no client flash. On mobile the trigger opens the sidebar sheet.
 */
export function SiteHeader({ breadcrumb }: { breadcrumb?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      {/* No fixed height → the component's `self-stretch` spans the full header. */}
      <Separator orientation="vertical" className="mr-2" />
      {breadcrumb}
    </header>
  )
}
