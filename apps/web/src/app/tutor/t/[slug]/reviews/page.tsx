import type { Metadata, Route } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, MessageSquare, Pin } from "lucide-react"

import { buttonVariants } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import { RatingSummary, TagCloud } from "@iedora/product-tutor/features/booking/components/reviews"
import { Stars } from "@iedora/product-tutor/features/booking/components/stars"
import { getTutorBooking, getTutorIdBySlug, getTutorReviews } from "@iedora/product-tutor/api/tutor-profile"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function fullDate(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

async function load(slug: string) {
  const id = await getTutorIdBySlug(slug)
  if (!id) return null
  const [tutor, reviews] = await Promise.all([getTutorBooking(id), getTutorReviews(id)])
  return tutor ? { tutor, reviews } : null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await load(slug)
  if (!data) return {}
  const { tutor } = data
  const { rating, reviewCount } = tutor.stats
  const proof = rating !== null ? `${rating.toFixed(1)}★ from ${reviewCount} reviews. ` : ""
  const title = `Reviews of ${tutor.displayName} · Maths tutor`
  return {
    title,
    description: `${proof}Read what parents and students say about lessons with ${tutor.displayName}.`,
    alternates: { canonical: `/t/${slug}/reviews` },
    openGraph: { type: "profile", title, url: `/t/${slug}/reviews` },
  }
}

export default async function TutorReviewsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await load(slug)
  if (!data) notFound()

  const { tutor, reviews } = data
  const { rating, reviewCount } = tutor.stats
  const bookHref = `/book/${tutor.id}` as Route
  const landingHref = `/t/${slug}` as Route

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={landingHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to {tutor.displayName}
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        What parents and students say about {tutor.displayName}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {reviewCount} verified review{reviewCount === 1 ? "" : "s"} from real lessons.
      </p>

      {rating !== null && (
        <div className="mt-6">
          <RatingSummary rating={rating} reviewCount={reviewCount} breakdown={reviews.breakdown} />
        </div>
      )}

      <TagCloud className="mt-4" tags={reviews.tags.slice(0, 8)} />

      {/* One review per line, matching the landing's left-accent quote style. */}
      <ul className="mt-6 flex flex-col divide-y divide-border">
        {reviews.reviews.map((review) => (
          <li key={review.id} className="py-5 first:pt-0">
            <div className="flex flex-col gap-2 border-l-2 border-primary/25 pl-4">
              <div className="flex items-center justify-between gap-2">
                <Stars value={review.rating} size="size-3.5" />
                {review.pinned && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                    <Pin className="size-3 fill-current" />
                    Pinned
                  </span>
                )}
              </div>
              {review.comment && (
                <p className="text-sm leading-relaxed text-foreground">{review.comment}</p>
              )}
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{review.studentName}</span> ·{" "}
                {review.subject} · {fullDate(review.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-8">
        <Link href={bookHref} className={cn(buttonVariants({ size: "lg" }))}>
          <MessageSquare className="size-4" />
          Book a free intro
        </Link>
        <span className="text-sm text-muted-foreground">
          A free 15-minute chat with me. No card needed.
        </span>
      </div>
    </div>
  )
}
