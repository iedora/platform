"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { cn } from "@iedora/ui/lib/utils"

/**
 * Light/dark switch. Renders a stable placeholder until mounted so server and
 * client agree (theme is only known in the browser). Flips between the two
 * concrete themes — no "system" option, to keep the choice a single tap.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = React.useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  React.useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Switch theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium transition-colors hover:bg-muted",
        className,
      )}
    >
      {/* Suppress hydration warning: the icon depends on the resolved theme,
          which is only correct after mount. */}
      <span suppressHydrationWarning className="grid size-4 place-items-center">
        {mounted && isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </span>
      <span suppressHydrationWarning>{mounted && isDark ? "Light" : "Dark"}</span>
    </button>
  )
}
