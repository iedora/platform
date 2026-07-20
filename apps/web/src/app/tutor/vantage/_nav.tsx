"use client"

import { Activity, LayoutDashboard, type LucideIcon, Mail, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@iedora/ui/lib/utils"

const LINKS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/vantage", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/vantage/users", label: "Users", icon: Users },
  { href: "/vantage/audit", label: "Audit log", icon: Activity },
  { href: "/vantage/emails", label: "Emails", icon: Mail },
]

export function VantageNav() {
  const path = usePathname()
  return (
    <nav className="flex flex-col gap-0.5">
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={2} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
