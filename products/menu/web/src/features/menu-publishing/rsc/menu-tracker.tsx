'use client'

import { useEffect } from 'react'

/**
 * Guest engagement tracker for the public menu. Watches every `[data-item-id]`
 * dish with an IntersectionObserver and, when the diner leaves (tab hidden /
 * page unload), fires one `navigator.sendBeacon` to `/track/{slug}/session`
 * with the dwell time + the set of dishes that scrolled into view. Powers the
 * dashboard's "Avg. time" and "Top dishes" metrics. Fire-and-forget; never
 * blocks or surfaces errors to the guest.
 */
export function MenuTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const start = Date.now()
    const viewed = new Set<string>()

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).dataset.itemId
            if (id) viewed.add(id)
          }
        }
      },
      { threshold: 0.5 },
    )
    document.querySelectorAll('[data-item-id]').forEach((el) => obs.observe(el))

    let sent = false
    const send = () => {
      if (sent) return
      sent = true
      const durationSeconds = Math.round((Date.now() - start) / 1000)
      const payload = JSON.stringify({ durationSeconds, items: [...viewed] })
      try {
        navigator.sendBeacon(
          `/track/${slug}/session`,
          new Blob([payload], { type: 'application/json' }),
        )
      } catch {
        // ignore — fire-and-forget
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') send()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', send)

    return () => {
      obs.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', send)
      send()
    }
  }, [slug])

  return null
}
