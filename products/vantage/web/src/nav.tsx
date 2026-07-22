"use client"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@iedora/ui/components/ui/sidebar"
import { Activity, LayoutDashboard, type LucideIcon, Mail, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

// Root-relative paths: the vantage surface runs under its own subdomain, and the
// web proxy rewrites `/audit` → internal `/vantage/audit`. usePathname reports the
// public path (`/audit`), so match on that.
const LINKS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit", label: "Audit log", icon: Activity },
  { href: "/emails", label: "Emails", icon: Mail },
]

export function VantageNav() {
  const path = usePathname()
  return (
    <SidebarMenu>
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path === href || path.startsWith(`${href}/`)
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton render={<Link href={href} />} isActive={active} tooltip={label}>
              <Icon strokeWidth={2} />
              <span>{label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
