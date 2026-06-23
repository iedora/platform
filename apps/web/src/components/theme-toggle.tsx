'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { MoonIcon, SunIcon } from '@phosphor-icons/react'
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
      {isDark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </Button>
  )
}
