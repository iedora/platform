import { notFound } from "next/navigation"

import { BackLink } from "@iedora/product-tutor/components/back-link"
import { RatingSummary, ReviewCard, TagCloud } from "@iedora/product-tutor/features/booking/components/reviews"
import { getTutorBooking, getTutorReviews } from "@iedora/product-tutor/api/tutor-profile"

export default async function TutorReviewsPage({
  params,
}: {
  params: Promise<{ tutorId: string }>
}) {
  const { tutorId } = await params
  const tutor = await getTutorBooking(tutorId)
  if (!tutor) notFound()

  const { reviews, breakdown, tags } = await getTutorReviews(tutor.id)
  const { rating, reviewCount } = tutor.stats
  if (rating === null) notFound()

  return (
    <div className="mx-auto max-w-2xl p-4 pb-10 sm:p-6">
      <BackLink href={`/book/${tutor.id}`}>{tutor.displayName}</BackLink>

      <h1 className="mb-4 text-xl font-semibold">Reviews</h1>

      <RatingSummary rating={rating} reviewCount={reviewCount} breakdown={breakdown} />

      <TagCloud className="mt-3" tags={tags} />

      <div className="mt-4 flex flex-col gap-3">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </div>
  )
}
