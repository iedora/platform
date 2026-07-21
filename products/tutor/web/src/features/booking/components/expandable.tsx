"use client"

import { cn } from "@iedora/ui/lib/utils"
import { ChevronDown } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { haptic } from "@iedora/product-tutor/lib/haptics"

// Measuring must happen before the browser paints, otherwise the "More" button
// pops in a frame after the text and flickers. useLayoutEffect does that, but it
// warns during SSR, so fall back to useEffect on the server (which never paints).
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * Clamped prose with a "More" affordance that only appears if the text is
 * actually clamped. MyTutor shows "Show more" unconditionally, so half the time
 * it opens onto nothing — the click is a lie. We measure first.
 */
export function Expandable({
  text,
  lines = 4,
  className,
}: {
  text: string
  lines?: number
  className?: string
}) {
  // Blank-line-separated paragraphs, as typed. A five-paragraph "About me"
  // rendered as one block is a wall nobody reads.
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim())
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)

  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    measure()
    // Re-measure on width changes: a rotate or a resize can un-clamp the text.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
    // Only while collapsed — once open, clientHeight is the full height and the
    // comparison would always say "not clamped".
  }, [open])

  return (
    <div className={className}>
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground",
          !open && "overflow-hidden",
        )}
        style={
          open
            ? undefined
            : // -webkit-box clamps across the whole block, so the paragraph gaps
              // survive but the text still cuts off at `lines` with an ellipsis.
              { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines }
        }
      >
        {paragraphs.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {(clamped || open) && (
        <button
          type="button"
          onClick={() => {
            haptic()
            setOpen((v) => !v)
          }}
          className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          {open ? "Less" : "More"}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      )}
    </div>
  )
}
