'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  BookOpen,
  CreditCard,
  Home,
  LayoutGrid,
  QrCode,
  Settings,
  Store,
} from 'lucide-react'

const ICONS = {
  overview: LayoutGrid,
  home: Home,
  menu: BookOpen,
  restaurants: Store,
  qr: QrCode,
  settings: Settings,
  billing: CreditCard,
  stats: BarChart3,
} as const

export type BottomTab = {
  href: string
  label: string
  icon: keyof typeof ICONS
  /** Match the path exactly (else prefix-match). Use for the dashboard root. */
  exact?: boolean
}

/**
 * Mobile bottom tab bar (Pencil "Admin / App Bottom Nav"). Replaces the
 * old hamburger drawer below `lg`; the sidebar rail still serves desktop.
 */
export function BottomNav({ tabs }: { tabs: BottomTab[] }) {
  const pathname = usePathname()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-[color-mix(in_srgb,var(--background)_92%,transparent)] backdrop-blur lg:hidden"
      aria-label="Primary"
      data-test-id="dashboard-bottom-nav"
    >
      <ul className="mx-auto flex max-w-xl items-stretch px-2 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
        {tabs.map((t) => {
          const Icon = ICONS[t.icon]
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 py-2 text-[11px] font-semibold no-underline transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
                data-test-id={`bottom-nav-${t.icon}`}
              >
                <Icon size={22} strokeWidth={2} />
                {t.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
