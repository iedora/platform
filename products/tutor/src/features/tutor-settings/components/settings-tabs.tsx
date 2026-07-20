"use client"

import { cn } from "@iedora/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/subjects", label: "Subjects & rates" },
  { href: "/settings/reviews", label: "Reviews" },
] as const

/** Section nav for the tutor's settings pages. Each section is its own SSR route. */
export function SettingsTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
