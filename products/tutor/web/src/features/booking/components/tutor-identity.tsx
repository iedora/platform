import { cn } from "@iedora/ui/lib/utils"
import { BadgeCheck, Star, University } from "lucide-react"

import type { TutorStats } from "../booking.queries"

export function TutorAvatar({
  name,
  url,
  className,
  viewTransitionName,
  alt,
  priority,
  size,
}: {
  name: string
  url?: string | null
  className?: string
  /**
   * Shared `view-transition-name` so this avatar morphs into the one on the next
   * page (list card -> profile hero). Must be unique per element on a page, so
   * callers scope it by tutor id. Omit where no morph is wanted.
   */
  viewTransitionName?: string
  /**
   * Describe the photo where it carries meaning (a hero portrait, an about block).
   * Left empty by default so the many small decorative avatars stay out of the
   * accessibility tree and off the image-SEO radar.
   */
  alt?: string
  /** Above-the-fold portrait: load eagerly with high fetch priority for LCP. */
  priority?: boolean
  /** Intrinsic square px, set as width/height so the box is reserved (no CLS). */
  size?: number
}) {
  const style = viewTransitionName ? ({ viewTransitionName } as React.CSSProperties) : undefined

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={alt ?? ""}
        width={size}
        height={size}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        style={style}
        className={cn("shrink-0 rounded-xl object-cover", className)}
      />
    )
  }
  const initials = name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-chart-2 font-semibold text-primary-foreground",
        className,
      )}
    >
      {initials}
    </span>
  )
}

/** The one public trust signal rank earns. No XP, no ladder. */
export function SuperTutorBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
      <BadgeCheck className="size-3.5" />
      Super tutor
    </span>
  )
}

/**
 * Institution and degree as two lines that share a left edge, with the icon in
 * its own gutter — so nothing wraps raggedly under the icon.
 */
export function TutorCredential({
  university,
  degree,
  className,
}: {
  university: string | null
  degree: string | null
  className?: string
}) {
  if (!university && !degree) return null
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <University
        className="mt-[0.15rem] size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0 leading-snug">
        {university && <p className="truncate text-sm">{university}</p>}
        {degree && <p className="truncate text-xs text-muted-foreground">{degree}</p>}
      </div>
    </div>
  )
}

/** Compact, single-line credibility: rating · reviews · lessons taught. */
export function TutorStatsRow({ stats, className }: { stats: TutorStats; className?: string }) {
  const parts: React.ReactNode[] = []

  if (stats.rating !== null) {
    parts.push(
      <span key="rating" className="flex items-center gap-1 font-medium text-foreground">
        <Star className="size-3.5 fill-rating text-rating" />
        {stats.rating.toFixed(1)}
      </span>,
    )
    parts.push(
      <span key="reviews">
        {stats.reviewCount} review{stats.reviewCount === 1 ? "" : "s"}
      </span>,
    )
  } else {
    parts.push(<span key="new">New tutor</span>)
  }

  parts.push(
    <span key="lessons">
      {stats.lessonsTaught} lesson{stats.lessonsTaught === 1 ? "" : "s"}
    </span>,
  )

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden>·</span>}
          {part}
        </span>
      ))}
    </div>
  )
}
