"use client"

import { cn } from "@iedora/ui/lib/utils"
import { useEffect, useState } from "react"

import type { TutorReview } from "../booking.queries"
import { Stars } from "./stars"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function shortDate(date: Date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

const ROTATE_MS = 6000

/**
 * Rotates through several reviews instead of pinning one.
 *
 * SSR + SEO: every review is rendered into the server HTML and only visually
 * toggled with opacity (never display:none), so a crawler with no JS still reads
 * all of them, and the cards are stacked in a single grid cell so nothing shifts
 * as they cross-fade. Auto-advance is a hydration-only nicety that honours
 * prefers-reduced-motion and pauses while the reader is hovering or focused.
 */
export function ReviewRotator({ reviews }: { reviews: TutorReview[] }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = reviews.length

  useEffect(() => {
    if (count <= 1 || paused) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = setInterval(() => setActive((a) => (a + 1) % count), ROTATE_MS)
    return () => clearInterval(id)
  }, [count, paused])

  if (count === 0) return null

  return (
    <div
      className="mt-3 rounded-2xl border border-border bg-card p-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* All in one grid cell: container is as tall as the tallest card, and the
          rest cross-fade underneath it without moving. */}
      <div className="grid">
        {reviews.map((review, i) => {
          const shown = i === active
          return (
            <blockquote
              key={review.id}
              aria-hidden={!shown}
              className={cn(
                "col-start-1 row-start-1 transition-opacity duration-500",
                shown ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Stars value={review.rating} size="size-3.5" />
                <span className="text-xs text-muted-foreground">{shortDate(review.createdAt)}</span>
              </div>
              <p className="mt-2.5 line-clamp-4 text-sm leading-relaxed">{review.comment}</p>
              <footer className="mt-3 flex items-center gap-2">
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                >
                  {initials(review.studentName)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{review.studentName}</span> ·{" "}
                  {review.subject}
                </span>
              </footer>
            </blockquote>
          )
        })}
      </div>

      {count > 1 && (
        <div className="mt-3.5 flex items-center justify-center gap-1.5">
          {reviews.map((review, i) => (
            <button
              key={review.id}
              type="button"
              aria-label={`Show review ${i + 1} of ${count}`}
              aria-current={i === active}
              onClick={() => setActive(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === active
                  ? "w-4 bg-primary"
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50",
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
