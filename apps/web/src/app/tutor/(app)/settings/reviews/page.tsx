import { notFound } from "next/navigation"

import { ReviewPinner } from "@iedora/product-tutor/features/tutor-settings/components/review-pinner"
import { getTutorSettingsReviews } from "@iedora/product-tutor/api/tutor-settings"
import { requireViewer } from "@iedora/product-tutor/auth/session"

export default async function SettingsReviewsPage() {
  const viewer = await requireViewer()
  if (!viewer.tutorId) notFound()
  const reviews = await getTutorSettingsReviews()

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Pin your best reviews to show them first on your page.
      </p>
      {reviews.length > 0 ? (
        <ReviewPinner reviews={reviews} />
      ) : (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          No written reviews yet. They&rsquo;ll appear here once students leave them.
        </p>
      )}
    </div>
  )
}
