import { Telescope } from "lucide-react"
import type { Metadata } from "next"

import { requireSuperAdmin } from "@iedora/product-tutor/vantage/gate"

import { VantageNav } from "./_nav"

export const metadata: Metadata = {
  title: { default: "Vantage", template: "%s · Vantage" },
  robots: { index: false, follow: false },
}

// Platform super-admin console: auth · audit · email, over the SDKs. Gated on the
// platform:admin JWT role (verified offline, decoupled from tutor's own admin bit).
export default async function VantageLayout({ children }: { children: React.ReactNode }) {
  const claims = await requireSuperAdmin()

  const wordmark = (
    <div className="flex items-center gap-2">
      <Telescope className="size-5 text-primary" strokeWidth={2} />
      <span className="text-[15px] font-semibold tracking-tight text-foreground">Vantage</span>
    </div>
  )

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-5 md:flex">
        <div className="mb-6 px-2">{wordmark}</div>
        <VantageNav />
        <div className="mt-auto space-y-0.5 px-2 pt-6 text-xs text-muted-foreground">
          <div className="truncate" title={claims.email}>
            {claims.email}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider">platform admin</div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border bg-sidebar/95 px-4 py-3 backdrop-blur md:hidden">
        {wordmark}
        <div className="-mx-1 overflow-x-auto">
          <VantageNav />
        </div>
      </header>

      <main className="min-w-0 flex-1 px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
