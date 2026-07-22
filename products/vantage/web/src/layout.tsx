import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@iedora/ui/components/ui/sidebar"
import { Telescope } from "lucide-react"
import type { Metadata } from "next"

import { requireSuperAdmin } from "./gate"
import { VantageNav } from "./nav"

export const metadata: Metadata = {
  title: { default: "Vantage", template: "%s · Vantage" },
  robots: { index: false, follow: false },
}

// Platform super-admin console: auth · audit · email, over the SDKs. Gated on the
// platform:admin JWT role (verified offline, decoupled from tutor's own admin bit).
// Chrome is the shadcn Sidebar (full-height, collapsible, mobile off-canvas).
export default async function VantageLayout({ children }: { children: React.ReactNode }) {
  const claims = await requireSuperAdmin()

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Telescope className="size-5 shrink-0 text-primary" strokeWidth={2} />
            <span className="text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              Vantage
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <VantageNav />
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="space-y-0.5 px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            <div className="truncate" title={claims.email}>
              {claims.email}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider">platform admin</div>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <main className="min-w-0 flex-1 px-5 py-6 sm:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
