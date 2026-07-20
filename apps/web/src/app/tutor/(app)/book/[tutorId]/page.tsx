import {
  INTRO_DURATION_MIN,
  STANDARD_BUFFER_MIN,
  STANDARD_DURATION_MIN,
} from "@iedora/product-tutor/domain/status"
import { INTRO_BOOKING_DAYS } from "@iedora/product-tutor/domain/time"
import { GraduationCap } from "lucide-react"
import { notFound } from "next/navigation"

import { BackLink } from "@iedora/product-tutor/components/back-link"
import { TeachingSchedule } from "@iedora/product-tutor/features/booking/components/teaching-schedule"
import { BOOKING_ANCHOR, BookCta } from "@iedora/product-tutor/features/booking/components/book-cta"
import { Expandable } from "@iedora/product-tutor/features/booking/components/expandable"
import { IntroBooking } from "@iedora/product-tutor/features/booking/components/intro-booking"
import { RecurringBooking } from "@iedora/product-tutor/features/booking/components/recurring-booking"
import { Reviews } from "@iedora/product-tutor/features/booking/components/reviews"
import {
  SuperTutorBadge,
  TutorAvatar,
  TutorCredential,
} from "@iedora/product-tutor/features/booking/components/tutor-identity"
import { generateSlots, generateWeeklyOptions, groupSlotsByDay } from "@iedora/product-tutor/features/booking/booking.slots"
import { hasLessonWith } from "@iedora/product-tutor/api/booking"
import { getTutorBooking, getTutorReviews } from "@iedora/product-tutor/api/tutor-profile"
import { requireViewer } from "@iedora/product-tutor/auth/session"

export default async function TutorProfilePage({
  params,
}: {
  params: Promise<{ tutorId: string }>
}) {
  const { tutorId } = await params
  // Independent reads — the cached tutor profile and the per-request viewer — run
  // in parallel instead of one after the other.
  const [tutor, viewer] = await Promise.all([getTutorBooking(tutorId), requireViewer()])
  if (!tutor) notFound()

  const { reviews, tags } = await getTutorReviews(tutor.id)
  const unlockedWeekly = await hasLessonWith(tutor.id)

  const cheapest = tutor.subjects.reduce(
    (min, s) => (s.pricePennies < min.pricePennies ? s : min),
    tutor.subjects[0]!,
  )
  const { rating, reviewCount, lessonsTaught } = tutor.stats

  return (
    <div className="mx-auto max-w-2xl p-4 pb-10 sm:p-6">
      <BackLink href="/book">All tutors</BackLink>

      {/* Hero. Everything needed to decide — face, credential, proof, price, tap. */}
      <header className="overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-primary/8 to-card p-4">
        <div className="flex items-center gap-4">
          <TutorAvatar
            name={tutor.displayName}
            url={tutor.avatarUrl}
            className="size-20 text-xl"
            viewTransitionName={`tutor-avatar-${tutor.id}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-xl font-semibold">{tutor.displayName}</h1>
              {tutor.stats.superTutor && <SuperTutorBadge />}
            </div>
            <TutorCredential
              university={tutor.university}
              degree={tutor.degree}
              className="mt-1.5"
            />
          </div>
        </div>

        <div className="mt-5">
          {unlockedWeekly ? (
            <BookCta label={`Book a weekly slot · ${cheapest.price}`} />
          ) : (
            <>
              <BookCta label="Book a free 15-min intro" />
              <p className="mt-2 text-center text-xs text-muted-foreground">
                No card needed. Weekly lessons unlock after — from {cheapest.price} a lesson.
              </p>
            </>
          )}
        </div>
      </header>

      {tutor.bio && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">About {tutor.displayName.split(" ")[0]}</h2>
          <Expandable text={tutor.bio} />
        </section>
      )}

      {tutor.teachingStyle && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">About my sessions</h2>
          <Expandable text={tutor.teachingStyle} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Teaches</h2>
        <ul className="flex flex-col gap-2">
          {tutor.subjects.map((subject) => (
            <li
              key={subject.qualificationId}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <GraduationCap className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {subject.subject}
              </span>
              <span className="shrink-0 text-sm font-semibold whitespace-nowrap">
                {subject.price}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  / {STANDARD_DURATION_MIN} min
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Reviews
        tutorId={tutor.id}
        rating={rating}
        reviewCount={reviewCount}
        lessonsTaught={lessonsTaught}
        tags={tags}
        reviews={reviews}
      />

      <TeachingSchedule
        rules={tutor.availability}
        tutorTz={tutor.tz}
        studentTz={viewer.timezone}
      />

      <section id={BOOKING_ANCHOR} className="mt-8 scroll-mt-4">
        {unlockedWeekly ? (
          <RecurringBooking
            tutorId={tutor.id}
            subjects={tutor.subjects}
            viewerTz={viewer.timezone}
            tutorTz={tutor.tz}
            weeklyOptions={generateWeeklyOptions({
              rules: tutor.availability,
              tz: tutor.tz,
              durationMinutes: STANDARD_DURATION_MIN + STANDARD_BUFFER_MIN,
              strideMinutes: STANDARD_DURATION_MIN + STANDARD_BUFFER_MIN,
            })}
          />
        ) : (
          <IntroBooking
            tutorId={tutor.id}
            subjects={tutor.subjects}
            viewerTz={viewer.timezone}
            tutorTz={tutor.tz}
            tutorName={tutor.displayName}
            // Generated from the tutor's availability in the tutor's zone, then
            // bucketed into days in the *viewer's* — the two disagree about which
            // day a late slot falls on.
            days={groupSlotsByDay(
              generateSlots({
                rules: tutor.availability,
                tz: tutor.tz,
                durationMinutes: INTRO_DURATION_MIN,
                strideMinutes: INTRO_DURATION_MIN,
                days: INTRO_BOOKING_DAYS,
              }),
              viewer.timezone,
            )}
          />
        )}
      </section>
    </div>
  )
}
