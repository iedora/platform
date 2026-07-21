"use client"

import { MARKETPLACE_ENABLED } from "@iedora/product-tutor/domain/status"
import { cn } from "@iedora/ui/lib/utils"
import { CalendarPlus, GraduationCap, MessageSquare, User } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const ALL_ITEMS = [
  { href: "/chat", label: "Messages", icon: MessageSquare },
  { href: "/lessons", label: "Lessons", icon: GraduationCap },
  { href: "/book", label: "Book", icon: CalendarPlus },
  { href: "/account", label: "You", icon: User },
] as const

// Closed beta hides tutor browsing; students reach tutors via their landing pages.
const ITEMS = MARKETPLACE_ENABLED ? ALL_ITEMS : ALL_ITEMS.filter((item) => item.href !== "/book")

function useActive() {
  const pathname = usePathname()
  return {
    pathname,
    isActive: (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    // An open conversation is immersive — the tab bar gets out of the way.
    inConversation: /^\/chat\/[^/]+$/.test(pathname),
  }
}

/** Thumb-reachable bottom tabs. Mobile only. */
export function AppTabs() {
  const { isActive, inConversation } = useActive()
  if (inConversation) return null

  return (
    <nav className="flex shrink-0 items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[0.65rem] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Desktop sidebar rail. */
export function AppSidebar() {
  const { isActive } = useActive()

  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-card p-3 md:flex">
      <Link href="/" className="mb-3 flex items-center gap-2 px-2 py-1 font-semibold">
        <GraduationCap className="size-5 text-primary" />
        Tutor
      </Link>
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4.5" />
            {label}
          </Link>
        )
      })}
    </aside>
  )
}
