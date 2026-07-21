"use client"

import { ArrowLeft } from "lucide-react"
import Link, { type LinkProps } from "next/link"
import { useRouter } from "next/navigation"

import { haptic } from "../lib/haptics"

/**
 * A back affordance that actually goes back.
 *
 * As a plain <Link> this *pushes* a new history entry, which lands you on a fresh
 * entry with no saved scroll offset — so returning to a page you'd scrolled
 * dumped you at the top, and the forward history was clobbered too. When there's
 * somewhere to go back to we pop instead; the href stays as the fallback for a
 * cold deep-link (or a middle-click / open-in-new-tab, which we must not hijack).
 */
// LinkProps rather than ComponentProps<typeof Link>: Link is generic under Typed
// Routes, and taking its props off the component collapses the route param to
// `unknown`, which then rejects every interpolated href like `/book/${id}`.
export function BackLink({
  href,
  children,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Link's own default
  href: LinkProps<any>["href"]
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        if (window.history.length <= 1) return
        event.preventDefault()
        haptic()
        router.back()
      }}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {children}
    </Link>
  )
}
