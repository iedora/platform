'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@iedora/ui/components/ui/button'

/**
 * Light/dark theme toggle (next-themes). Renders an icon-only ghost button.
 * Guards on `mounted` so the icon doesn't mismatch between SSR and the
 * client-resolved theme.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      data-test-id="theme-toggle"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  )
}
