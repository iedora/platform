import { REVIEW_TAG_LABEL } from "@iedora/product-tutor/enums"
import { cn } from "@iedora/ui/lib/utils"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

import type { RatingBreakdown, TagCount, TutorReview } from "../booking.queries"
import { ReviewRotator } from "./review-rotator"
import { Stars } from "./stars"

const STAR_ROWS = [5, 4, 3, 2, 1] as const

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** Stable per-name colour so the same reviewer always gets the same chip. */
const AVATAR_TINTS = [
  "bg-primary/15 text-primary",
  "bg-rating/15 text-rating",
  "bg-chart-2/20 text-chart-2",
  "bg-destructive/15 text-destructive",
]
function tint(name: string) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length]!
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function shortDate(date: Date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
        tint(name),
      )}
    >
      {initials(name)}
    </span>
  )
}

/**
 * What parents kept saying, counted. Six paragraphs of prose all say roughly the
 * same three things, and nobody reads six paragraphs on a phone; the counts are
 * the part you can actually take in at a glance.
 */
export function TagCloud({ tags, className }: { tags: TagCount[]; className?: string }) {
  if (tags.length === 0) return null
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map(({ tag, label, count }) => (
        <li
          key={tag}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted py-1 pr-1.5 pl-2.5 text-xs font-medium"
        >
          {label}
          <span className="grid min-w-4 place-items-center rounded-full bg-primary/15 px-1 text-[0.65rem] font-semibold tabular-nums text-primary">
            {count}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** One review, in full. Used on the all-reviews page. */
export function ReviewCard({ review }: { review: TutorReview }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <Avatar name={review.studentName} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{review.studentName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {review.subject} · {shortDate(review.createdAt)}
          </span>
        </span>
        <Stars value={review.rating} size="size-3.5" />
      </header>

      {review.comment && <p className="mt-3 text-sm leading-relaxed">{review.comment}</p>}

      {review.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {review.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
            >
              {REVIEW_TAG_LABEL[tag]}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

export function RatingSummary({
  rating,
  reviewCount,
  breakdown,
}: {
  rating: number
  reviewCount: number
  breakdown: RatingBreakdown
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="shrink-0 text-center">
        <div className="text-4xl leading-none font-bold tabular-nums">{rating.toFixed(1)}</div>
        <Stars value={rating} className="mt-1.5" size="size-3.5" />
        <div className="mt-1 text-xs text-muted-foreground">{reviewCount} reviews</div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {STAR_ROWS.map((star) => {
          const n = breakdown[star]
          const pct = reviewCount === 0 ? 0 : (n / reviewCount) * 100
          return (
            <div key={star} className="flex items-center gap-2">
              <span className="w-2 text-right text-xs tabular-nums text-muted-foreground">
                {star}
              </span>
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-rating"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-4 text-right text-xs tabular-nums text-muted-foreground">
                {n}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The profile's whole review section: one card. Score, what parents say, and a
 * single quote to prove a human wrote it. The other five live one tap away.
 */
export function Reviews({
  tutorId,
  rating,
  reviewCount,
  lessonsTaught,
  tags,
  reviews,
}: {
  tutorId: string
  rating: number | null
  reviewCount: number
  lessonsTaught: number
  tags: TagCount[]
  reviews: TutorReview[]
}) {
  if (rating === null || reviewCount === 0) return null

  // A handful of the most substantial reviews to rotate through. Skip empty
  // comments (a bare 5 stars proves nothing) and lead with the longest, which
  // are the ones actually making the case.
  const rotating = reviews
    .filter((r) => r.comment.trim().length > 0)
    .sort((a, b) => b.comment.length - a.comment.length)
    .slice(0, 5)

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Reviews</h2>
        {lessonsTaught > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {lessonsTaught} lesson{lessonsTaught === 1 ? "" : "s"} taught
          </span>
        )}
      </div>

      <Link
        href={`/book/${tutorId}/reviews`}
        className="block rounded-2xl border border-border bg-card p-4 transition-colors active:bg-muted"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none font-bold tabular-nums">{rating.toFixed(1)}</span>
          <span className="min-w-0 flex-1">
            <Stars value={rating} size="size-4" />
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {reviewCount} review{reviewCount === 1 ? "" : "s"}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>

        <TagCloud className="mt-3" tags={tags.slice(0, 4)} />
      </Link>

      {/* Rotates through several reviews. Kept outside the Link so the dots don't
          navigate; every review is server-rendered for SEO (see ReviewRotator). */}
      <ReviewRotator reviews={rotating} />
    </section>
  )
}
