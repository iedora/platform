'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setUserLocale } from '@iedora/product-menu/features/dashboard-home/actions'

/**
 * Landing Lang Switch (Pencil "Lang Switch") — filled segmented EN/PT control.
 * Reuses the app's `setUserLocale` server action (sets the NEXT_LOCALE cookie
 * + revalidates the layout) so the choice persists across the whole site.
 * EN reflects the English fallback for any non-PT locale.
 */
export function LandingLangSwitch({ locale }: { locale: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const isPt = locale === 'pt'

  function select(code: string) {
    if ((code === 'pt') === isPt || pending) return
    startTransition(async () => {
      await setUserLocale(code)
      router.refresh()
    })
  }

  const seg = (code: string, label: string, active: boolean) => (
    <button
      type="button"
      onClick={() => select(code)}
      disabled={active || pending}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-[5px] transition-colors disabled:cursor-default ${
        active ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
      }`}
      data-test-id={`house-lang-${code}`}
    >
      {label}
    </button>
  )

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-muted p-[3px] font-heading text-[13px] font-bold"
      role="group"
      aria-label="Language"
    >
      {seg('en', 'EN', !isPt)}
      {seg('pt', 'PT', isPt)}
    </span>
  )
}
