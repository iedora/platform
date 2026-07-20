import { MARKETPLACE_ENABLED } from "@iedora/product-tutor/domain/status"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  SuperTutorBadge,
  TutorAvatar,
  TutorCredential,
  TutorStatsRow,
} from "@iedora/product-tutor/features/booking/components/tutor-identity"
import { listBookableTutors } from "@iedora/product-tutor/api/booking"

export default async function BookPage() {
  // Browsing is off in closed beta; students reach tutors via landing pages.
  if (!MARKETPLACE_ENABLED) notFound()

  const tutors = await listBookableTutors()

  return (
    <div className="mx-auto max-w-2xl p-4 pb-8 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold">Find a tutor</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Every tutor starts you with a free 15-minute intro. No card needed.
      </p>

      <div className="flex flex-col gap-3">
        {tutors.map((tutor) => {
          const from = tutor.subjects.reduce(
            (cheapest, s) => (s.pricePennies < cheapest.pricePennies ? s : cheapest),
            tutor.subjects[0]!,
          )
          return (
            <Link
              key={tutor.id}
              href={`/book/${tutor.id}`}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:bg-muted active:scale-[0.99] active:bg-muted"
            >
              {/* Identity */}
              <div className="flex items-center gap-3">
                <TutorAvatar
                  name={tutor.displayName}
                  url={tutor.avatarUrl}
                  className="size-14 text-base"
                  viewTransitionName={`tutor-avatar-${tutor.id}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{tutor.displayName}</span>
                    {tutor.stats.superTutor && <SuperTutorBadge />}
                  </div>
                  <TutorCredential
                    university={tutor.university}
                    degree={tutor.degree}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* The pitch, not the first two lines of the life story. */}
              {tutor.tagline && (
                <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {tutor.tagline}
                </p>
              )}

              {/* Credibility on the left, price anchored right. */}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <TutorStatsRow stats={tutor.stats} />
                <span className="shrink-0 text-base font-semibold">
                  {from.price}
                  <span className="text-xs font-normal text-muted-foreground"> / lesson</span>
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
