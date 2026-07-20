import { Suspense } from "react"

import { AppSidebar, AppTabs } from "@iedora/product-tutor/components/app-nav"
import { DetectTimezone } from "@iedora/product-tutor/features/account/components/detect-timezone"
import { ScrollRestore, SCROLL_ID } from "@iedora/product-tutor/components/scroll-restore"
import { requireViewer } from "@iedora/product-tutor/auth/session"

/**
 * App shell, mobile-first: a full-height screen with thumb-reachable bottom
 * tabs. On desktop the tabs become a sidebar rail. `h-dvh` (not h-screen) so
 * mobile browser chrome doesn't clip the layout.
 *
 * Dynamically rendered (blocking SSR): the whole page is built on the server and
 * delivered complete, so there's no streaming fallback to flash.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer()

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <AppSidebar />
      {/* min-w-0 so wide content shrinks instead of stretching the layout. */}
      {/* overflow-anchor: none — as a restored page finishes streaming, the
          browser's scroll anchoring nudges the container to keep some element
          fixed, which drifts us off the position we just restored. */}
      <main
        id={SCROLL_ID}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto [overflow-anchor:none]"
      >
        {children}
      </main>

      <AppTabs />

      {/* Identifies the viewer's zone so nobody has to hunt through a list of 400. */}
      <DetectTimezone current={viewer.timezone} />

      {/* ScrollRestore reads useSearchParams; without a boundary that would opt
          every page under this layout out of static rendering. */}
      <Suspense fallback={null}>
        <ScrollRestore targetId={SCROLL_ID} />
      </Suspense>
    </div>
  )
}
