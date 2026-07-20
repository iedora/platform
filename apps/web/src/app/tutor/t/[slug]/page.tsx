import { Fragment } from "react"
import type { Metadata, Route } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  Clock,
  GraduationCap,
  Heart,
  MessageSquare,
  Pin,
  ShieldCheck,
} from "lucide-react"

import type { TutorHighlight } from "@iedora/product-tutor/types"
import { buttonVariants } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import { Stars } from "@iedora/product-tutor/features/booking/components/stars"
import { TutorAvatar } from "@iedora/product-tutor/features/booking/components/tutor-identity"
import { TeachingSchedule } from "@iedora/product-tutor/features/booking/components/teaching-schedule"
import type { TutorBooking, TutorReview } from "@iedora/product-tutor/features/booking/booking.queries"
import { getTutorBooking, getTutorIdBySlug, getTutorReviews } from "@iedora/product-tutor/api/tutor-profile"
import { ThemeToggle } from "@iedora/product-tutor/components/theme-toggle"
import { getViewer } from "@iedora/product-tutor/auth/session"

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
  const title = `${tutor.displayName} · Maths tutor`
  // Lead the description with the social proof — it's what earns the click in the SERP.
  const proof =
    rating !== null && reviewCount > 0 ? `${rating.toFixed(1)}★ from ${reviewCount} reviews. ` : ""
  const description = `${proof}${tutor.tagline ?? `Book a free intro with ${tutor.displayName}.`}`
  const canonical = `/t/${slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title,
      description,
      url: canonical,
      images: [{ url: "/marketing/og.jpg", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description },
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function monthYear(d: Date) {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export default async function TutorLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await load(slug)
  if (!data) notFound()

  const { tutor, reviews } = data
  const { rating, reviewCount, lessonsTaught } = tutor.stats
  const bookHref = `/book/${tutor.id}` as Route
  const cheapest = tutor.subjects.reduce(
    (m, s) => (s.pricePennies < m.pricePennies ? s : m),
    tutor.subjects[0]!,
  )
  const bioParas = (tutor.bio ?? "").split(/\n\s*\n/).filter(Boolean)
  const methodParas = (tutor.teachingStyle ?? "").split(/\n\s*\n/).filter(Boolean)
  const featured = reviews.reviews
    .filter((r) => r.comment.trim().length > 0)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.comment.length - a.comment.length)
    .slice(0, 6)

  const jsonLd = buildJsonLd({ slug, tutor, rating, reviewCount, cheapest, featured })

  return (
    <div className="flex min-h-svh flex-col">
      {/* Scroll-reveal, native CSS only. Gated so it never hides content on
          browsers without scroll-driven animations, and off under reduced motion. */}
      <style>{REVEAL_CSS}</style>
      {/* Structured data — drives the star rich-snippet on a review-heavy page. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Reading-progress bar. Decorative, scroll-driven, pure CSS. */}
      <div
        aria-hidden
        className="scroll-progress fixed inset-x-0 top-0 z-50 h-0.5 origin-left scale-x-0 bg-primary"
      />

      <main className="flex-1">
        <Hero
          tutor={tutor}
          rating={rating}
          reviewCount={reviewCount}
          bookHref={bookHref}
          fromPrice={cheapest.price}
        />

        <LevelTicker />

        <StatStrip rating={rating} reviewCount={reviewCount} lessonsTaught={lessonsTaught} />

        {/* About — a personal note, portrait alongside so it reads like a real
            person, not a listing. */}
        {bioParas.length > 0 && (
          <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
            <div className="reveal grid gap-8 md:grid-cols-[1fr_1.4fr] md:items-start">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">A little about me</h2>
                {tutor.degree && (
                  <p className="mt-1 text-sm text-muted-foreground">{tutor.degree}</p>
                )}
                {tutor.linkedinUrl && (
                  <a
                    href={tutor.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <LinkedInMark className="size-4" />
                    LinkedIn
                  </a>
                )}
              </div>
              <div className="flex flex-col gap-3 text-[0.95rem] leading-relaxed text-muted-foreground">
                {bioParas.slice(0, 5).map((p, i) => (
                  <p key={i} className={i === 0 ? "text-foreground" : undefined}>
                    {p}
                  </p>
                ))}
              </div>
            </div>
          </section>
        )}

        <Journey highlights={tutor.highlights} />

        {/* Method */}
        {methodParas.length > 0 && (
          <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
            <div className="reveal">
              <h2 className="mb-6 text-2xl font-semibold tracking-tight">How I teach</h2>
              {/* The three beats read as one connected method, arrows drawing the
                  flow between them — down the page on mobile, across on desktop. */}
              <ol className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-3">
                {methodParas.slice(0, 3).map((p, i, arr) => (
                  <Fragment key={i}>
                    <li className="flex-1">
                      <span className="mb-2 grid size-7 place-items-center rounded-full border border-primary/40 font-mono text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <p className="text-sm leading-relaxed text-muted-foreground">{p}</p>
                    </li>
                    {i < arr.length - 1 && <MethodArrow />}
                  </Fragment>
                ))}
              </ol>
            </div>
          </section>
        )}

        <Pricing subjects={tutor.subjects} />

        <HowItWorks />

        {featured.length > 0 && (
          <section className="border-y border-border bg-muted/30">
            <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
              <h2 className="reveal mb-6 text-2xl font-semibold tracking-tight">
                What parents and students say
              </h2>
              <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((r) => (
                  <Testimonial key={r.id} review={r} />
                ))}
              </div>
              {reviewCount > featured.length && (
                <Link
                  href={`/t/${slug}/reviews` as Route}
                  className="reveal mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Read all {reviewCount} reviews
                  <ArrowRight className="size-4" />
                </Link>
              )}
            </div>
          </section>
        )}

        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <TeachingSchedule rules={tutor.availability} tutorTz={tutor.tz} studentTz={tutor.tz} />
        </div>

        <Faq fromPrice={cheapest.price} />

        {/* Final CTA — a full-bleed band embedded in the page, not a floating card. */}
        <section className="relative overflow-hidden border-t border-border bg-primary/5">
          <WhiteboardBackdrop id="cta" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 py-12 text-center sm:px-6 sm:py-16">
            <h2 className="max-w-lg text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              See if I&rsquo;m the right fit for you.
            </h2>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" />
              No card needed. You pay per session, just before each lesson.
            </p>
            <Link
              href={bookHref}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 px-6 text-base transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0",
              )}
            >
              <MessageSquare className="size-4" />
              Book a free intro
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter name={tutor.displayName} />
    </div>
  )
}

/* -------------------------------- chrome --------------------------------- */

/**
 * No top navbar — nothing competes with the page's own story. Platform access
 * lives here in the footer instead: signed-in visitors reach their Dashboard,
 * everyone else gets a quiet Sign in, next to the "Powered by" mark.
 */
async function LandingFooter({ name }: { name: string }) {
  const viewer = await getViewer()

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <span>© {name}, Maths tutor</span>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
          <ThemeToggle className="text-xs text-muted-foreground" />
          <Link
            href={viewer ? "/lessons" : "/sign-in"}
            className="font-medium transition-colors hover:text-foreground"
          >
            {viewer ? "Dashboard" : "Sign in"}
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            Powered by
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <span className="grid size-4 place-items-center rounded bg-primary text-primary-foreground">
                <GraduationCap className="size-2.5" />
              </span>
              Tutor
            </span>
          </Link>
        </div>
      </div>
    </footer>
  )
}

/* ------------------------------- sections -------------------------------- */

function Hero({
  tutor,
  rating,
  reviewCount,
  bookHref,
  fromPrice,
}: {
  tutor: TutorBooking
  rating: number | null
  reviewCount: number
  bookHref: Route
  fromPrice: string
}) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary/8 to-background">
      <WhiteboardBackdrop id="hero" />
      <div className="relative mx-auto grid max-w-5xl items-center gap-10 px-4 pt-8 pb-12 sm:px-6 sm:pt-12 sm:pb-16 md:grid-cols-[1.15fr_1fr]">
        {/* Copy */}
        <div className="flex flex-col items-start gap-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <GraduationCap className="size-3.5 text-primary" />
            Maths tutor · Qualified teacher
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            I teach maths until it clicks.
          </h1>
          <p className="max-w-md text-lg text-muted-foreground text-pretty">
            KS2 up to A-Level, Highers and IB. I&rsquo;m at my best with the students who&rsquo;ve
            decided maths just isn&rsquo;t for them.
          </p>
          {rating !== null && (
            <div className="flex items-center gap-2 text-sm">
              <Stars value={rating} size="size-4" />
              <span className="font-semibold">{rating.toFixed(1)}</span>
              <span className="text-muted-foreground">from {reviewCount} reviews</span>
            </div>
          )}
          <div className="mt-1 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link
              href={bookHref}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 px-6 text-base transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0",
              )}
            >
              <MessageSquare className="size-4" />
              Book a free intro
            </Link>
            <span className="text-sm text-muted-foreground">
              15 minutes, no card. From {fromPrice} a lesson.
            </span>
          </div>
        </div>

        {/* Portrait — framed by a soft ring, not a card, so it sits on the
            whiteboard rather than floating in a box. */}
        <div className="portrait-parallax mx-auto w-full max-w-xs md:mx-0 md:ml-auto">
          <div className="group relative overflow-hidden rounded-3xl ring-1 ring-border">
            <TutorAvatar
              name={tutor.displayName}
              url={tutor.avatarUrl}
              alt={`${tutor.displayName}, Maths tutor`}
              priority
              size={400}
              className="aspect-square size-full rounded-3xl text-5xl transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function StatStrip({
  rating,
  reviewCount,
  lessonsTaught,
}: {
  rating: number | null
  reviewCount: number
  lessonsTaught: number
}) {
  // Round lessons down to a clean 50 so it reads as a deliberate "250+", not a
  // number that happens to match the review count.
  const lessons = lessonsTaught >= 50 ? `${Math.floor(lessonsTaught / 50) * 50}+` : "New"
  const tiles = [
    { value: rating !== null ? rating.toFixed(1) : "New", label: "Average rating" },
    { value: reviewCount.toString(), label: "Reviews" },
    { value: lessons, label: "Lessons taught" },
    { value: "DBS", label: "Background checked" },
  ]
  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <dl className="grid grid-cols-2 gap-y-6 sm:grid-cols-4 sm:divide-x sm:divide-border">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="reveal group flex flex-col items-center gap-0.5 text-center transition-transform duration-300 hover:-translate-y-0.5"
          >
            <dt className="sr-only">{t.label}</dt>
            <dd className="text-3xl font-semibold tracking-tight tabular-nums transition-colors group-hover:text-primary">
              {t.value}
            </dd>
            <span className="text-xs text-muted-foreground">{t.label}</span>
          </div>
        ))}
      </dl>
    </section>
  )
}

const JOURNEY_ICONS = [GraduationCap, Award, BookOpen, Clock, Heart]

function Journey({ highlights }: { highlights: TutorHighlight[] }) {
  if (highlights.length === 0) return null
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <h2 className="reveal mb-6 text-2xl font-semibold tracking-tight">Why parents trust me</h2>
        <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {highlights.map((h, i) => {
            const Icon = JOURNEY_ICONS[i % JOURNEY_ICONS.length]!
            return (
              <li
                key={h.label}
                className="reveal group flex items-start gap-3 transition-transform duration-300 hover:-translate-y-0.5"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/20">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{h.label}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                    {h.body}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function Pricing({ subjects }: { subjects: TutorBooking["subjects"] }) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="reveal mb-6 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">What I teach</h2>
        <span className="text-sm text-muted-foreground">Per 1-hour lesson</span>
      </div>
      <div className="divide-y divide-border border-y border-border">
        {subjects.map((s) => (
          <div
            key={s.qualificationId}
            className="reveal -mx-3 flex items-center justify-between gap-3 rounded-xl px-3 py-4 transition-colors hover:bg-muted/60"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{s.subject}</span>
              <span className="text-xs text-muted-foreground">One-to-one, online</span>
            </span>
            <span className="shrink-0 text-right font-semibold whitespace-nowrap">{s.price}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    {
      icon: MessageSquare,
      title: "Start with a free intro",
      body: "A free 15-minute chat with me to talk through where you're at and what you need. No card, no commitment.",
    },
    {
      icon: CalendarClock,
      title: "Lock in a weekly slot",
      body: "Agree a time that fits your week. Add your card once, kept safe by Stripe, and reschedule anytime.",
    },
    {
      icon: BadgeCheck,
      title: "Learn and keep going",
      body: "You're charged per session, just before each lesson. Reschedule or pause whenever you need.",
    },
  ]
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <h2 className="reveal mb-6 text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="grid gap-8 sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="reveal flex flex-col gap-2.5">
              <span className="flex items-center gap-2 text-primary">
                <Icon className="size-5" />
                <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Testimonial({ review }: { review: TutorReview }) {
  return (
    <figure className="reveal flex flex-col gap-3 border-l-2 border-primary/25 pl-4 transition-all duration-300 hover:border-primary hover:pl-5">
      <div className="flex items-center justify-between gap-2">
        <Stars value={review.rating} size="size-3.5" />
        {review.pinned && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <Pin className="size-3 fill-current" />
            Pinned
          </span>
        )}
      </div>
      <blockquote className="line-clamp-6 text-sm leading-relaxed text-foreground">
        {review.comment}
      </blockquote>
      <figcaption className="mt-auto text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{review.studentName}</span> · {review.subject}{" "}
        · {monthYear(review.createdAt)}
      </figcaption>
    </figure>
  )
}

function Faq({ fromPrice }: { fromPrice: string }) {
  const faqs = [
    {
      q: "How does the free intro work?",
      a: "It's a free 15-minute video chat with me, right inside the app. No card needed, and there's no obligation to book after.",
    },
    {
      q: "How are lessons delivered?",
      a: "Online, in a shared classroom with a whiteboard. Booking, messages, and lessons all live in one chat.",
    },
    {
      q: "When do I pay?",
      a: `You're charged per session, just before each lesson, from ${fromPrice} a lesson. Never up front, and you can reschedule anytime.`,
    },
    {
      q: "What if we need to cancel?",
      a: "Reschedule or cancel from the chat. Cancel in time and the charge follows the lesson, so you're never paying for a session you didn't have.",
    },
  ]
  return (
    <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <h2 className="reveal mb-6 text-2xl font-semibold tracking-tight">Questions</h2>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {faqs.map((f) => (
          <div key={f.q} className="reveal">
            <h3 className="mb-1.5 text-sm font-semibold">{f.q}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{f.a}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------------------------------- SEO ---------------------------------- */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

/**
 * schema.org graph for the page: the tutor as a Person (entity, sameAs LinkedIn,
 * alumniOf) and their tutoring as a Service carrying the aggregateRating + a few
 * reviews. The rating is what earns the star snippet in search results.
 */
function buildJsonLd({
  slug,
  tutor,
  rating,
  reviewCount,
  cheapest,
  featured,
}: {
  slug: string
  tutor: TutorBooking
  rating: number | null
  reviewCount: number
  cheapest: TutorBooking["subjects"][number]
  featured: TutorReview[]
}) {
  const pageUrl = `${SITE}/t/${slug}`
  const person = {
    "@type": "Person",
    "@id": `${pageUrl}#person`,
    name: tutor.displayName,
    jobTitle: "Maths tutor",
    url: pageUrl,
    ...(tutor.avatarUrl && { image: `${SITE}${tutor.avatarUrl}` }),
    ...(tutor.tagline && { description: tutor.tagline }),
    ...(tutor.university && {
      alumniOf: { "@type": "EducationalOrganization", name: tutor.university },
    }),
    knowsAbout: tutor.subjects.map((s) => s.subject),
    ...(tutor.linkedinUrl && { sameAs: [tutor.linkedinUrl] }),
  }
  const service = {
    "@type": "Service",
    "@id": `${pageUrl}#service`,
    name: `Maths tutoring with ${tutor.displayName}`,
    serviceType: "Maths tutoring",
    provider: { "@id": `${pageUrl}#person` },
    areaServed: { "@type": "Country", name: "United Kingdom" },
    url: pageUrl,
    ...(rating !== null &&
      reviewCount > 0 && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: rating,
          reviewCount,
          bestRating: 5,
          worstRating: 1,
        },
      }),
    offers: {
      "@type": "Offer",
      price: (cheapest.pricePennies / 100).toFixed(2),
      priceCurrency: "GBP",
      availability: "https://schema.org/InStock",
    },
    review: featured.slice(0, 3).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.studentName },
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
      reviewBody: r.comment,
    })),
  }
  return { "@context": "https://schema.org", "@graph": [person, service] }
}

const TEACHING_LEVELS = [
  "KS2",
  "KS3",
  "GCSE Maths",
  "National 4/5",
  "Scottish Highers",
  "A-Level Maths",
  "IB Analysis & Approaches",
  "IB Applications & Interpretation",
  "First-year university",
]

/**
 * A live ticker of the levels I teach. The first copy is real, readable text
 * (keyword-rich, good for search); the second is an aria-hidden duplicate that
 * only exists so the marquee can loop without a visible seam. Under reduced
 * motion it simply sits still.
 */
function LevelTicker() {
  const Row = ({ hidden }: { hidden?: boolean }) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {TEACHING_LEVELS.map((level) => (
        <li
          key={level}
          className="flex items-center gap-5 pr-5 text-sm font-medium whitespace-nowrap text-muted-foreground"
        >
          {level}
          <span className="text-xs text-primary/50" aria-hidden>
            ◆
          </span>
        </li>
      ))}
    </ul>
  )
  return (
    <div
      className="marquee relative overflow-hidden border-b border-border bg-muted/20 py-3"
      aria-label="Levels I teach"
    >
      <div className="marquee-track flex w-max">
        <Row />
        <Row hidden />
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
    </div>
  )
}

/** Maths glyphs that drift around the whiteboard. `d` staggers the float. */
const WB_GLYPHS = [
  { t: "π", cls: "left-[6%] top-[26%] text-3xl sm:text-5xl", d: "0s", slow: false },
  { t: "∑", cls: "right-[8%] bottom-[20%] text-3xl sm:text-5xl", d: "1.1s", slow: true },
  { t: "√x", cls: "left-[13%] bottom-[14%] text-xl sm:text-3xl", d: "0.6s", slow: false },
  { t: "f(x)", cls: "right-[6%] top-[46%] text-lg sm:text-2xl", d: "1.7s", slow: true },
  { t: "x²", cls: "left-[46%] top-[9%] text-xl sm:text-3xl", d: "0.3s", slow: false },
  { t: "∫", cls: "right-[30%] top-[16%] text-2xl sm:text-4xl", d: "2.1s", slow: true },
]

/**
 * The whiteboard texture: faint graph paper, hand-sketched maths shapes (axes +
 * sine curve, a triangle, a circle with a radius) and drifting maths glyphs. All
 * decorative — inert, hidden from assistive tech, inline SVG (no network, no LCP
 * cost). Animation is pure CSS, gated by `prefers-reduced-motion` (see REVEAL_CSS).
 * Mobile-first: everything renders on phones at a smaller scale, not `sm`-only.
 * `id` keeps the grid <pattern> unique per instance.
 */
function WhiteboardBackdrop({ id }: { id: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 size-full text-foreground/[0.045]">
        <defs>
          <pattern id={`${id}-grid`} width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id}-grid)`} />
      </svg>

      {/* axes + sine wave, top-right — the sine draws itself in, then floats */}
      <svg
        viewBox="0 0 110 90"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="wb-float absolute -top-1 right-1 h-20 w-28 text-primary/20 sm:h-32 sm:w-40"
      >
        <path d="M12 78 H104 M12 78 V8" className="opacity-60" />
        <path className="wb-draw" d="M12 52 Q28 14 44 52 T76 52 T108 52" />
      </svg>

      {/* circle + radius, slow spin, mid-left */}
      <svg
        viewBox="0 0 60 60"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="wb-spin absolute top-[38%] -left-4 h-16 w-16 text-primary/15 sm:h-24 sm:w-24"
      >
        <circle cx="30" cy="30" r="22" />
        <path d="M30 30 L52 30" />
      </svg>

      {/* triangle, bottom-left, gentle float */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="wb-float-slow absolute bottom-4 left-3 h-12 w-12 text-primary/20 sm:h-16 sm:w-16"
      >
        <path d="M50 16 L84 80 L16 80 Z" />
      </svg>

      {/* drifting glyphs */}
      {WB_GLYPHS.map((g) => (
        <span
          key={g.t}
          style={{ animationDelay: g.d }}
          className={cn(
            "absolute font-mono font-semibold text-primary/15 select-none",
            g.slow ? "wb-float-slow" : "wb-float",
            g.cls,
          )}
        >
          {g.t}
        </span>
      ))}
    </div>
  )
}

/**
 * A hand-drawn connector between method steps. Points down on mobile (steps
 * stacked), right on desktop (steps in a row). Decorative — aria-hidden — and the
 * stroke draws itself in via CSS. Colour matches the page's primary accent.
 */
function MethodArrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 52 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mx-auto h-6 w-10 shrink-0 rotate-90 text-primary/50 sm:mt-9 sm:rotate-0 sm:self-start"
    >
      <path className="draw-on-scroll" d="M4 12 Q26 6 44 12" />
      <path className="draw-on-scroll" d="M37 5 L46 12 L37 19" />
    </svg>
  )
}

/** LinkedIn brand mark. lucide dropped brand glyphs (trademark), so it's inlined. */
function LinkedInMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.73v20.53C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.73C24 .78 23.2 0 22.22 0z" />
    </svg>
  )
}

/* Native scroll-driven reveal. `@supports` keeps content fully visible on
   browsers without scroll timelines; reduced-motion disables it outright. */
const REVEAL_CSS = `
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    /* Content eases up into place as it enters — scrubbed to scroll, so it feels
       hand-in-glove with the wheel. Long range + soft cubic for a satisfying settle. */
    .reveal {
      animation: reveal-in cubic-bezier(0.22, 1, 0.36, 1) both;
      animation-timeline: view();
      animation-range: entry 2% cover 32%;
    }
    /* Strokes that draw themselves as they scroll into view (method arrows), so
       the connection is drawn right when you arrive at it, not on page load. */
    .draw-on-scroll {
      stroke-dasharray: 260;
      stroke-dashoffset: 260;
      animation: wb-draw cubic-bezier(0.22, 1, 0.36, 1) both;
      animation-timeline: view();
      animation-range: entry 8% cover 42%;
    }
  }
  /* A reading-progress bar tied to page scroll. Pure CSS scroll() timeline, so it
     costs nothing and needs no JS. Hidden (scaleX 0) when unsupported. */
  @supports (animation-timeline: scroll()) {
    .scroll-progress {
      animation: scroll-progress linear both;
      animation-timeline: scroll(root block);
    }
  }
  /* Gentle parallax: the portrait drifts against the scroll as the hero passes. */
  @supports (animation-timeline: view()) {
    .portrait-parallax {
      animation: portrait-par linear both;
      animation-timeline: view();
      animation-range: cover;
    }
  }
  /* The level ticker loops forever; two identical copies make the seam invisible.
     Hovering pauses it, so a reader can stop and scan a level. */
  .marquee-track { animation: marquee 34s linear infinite; }
  .marquee:hover .marquee-track { animation-play-state: paused; }
  /* Whiteboard doodles: only animate when motion is welcome. Kept to transform
     and stroke so they stay cheap; the draw runs once, the floats loop softly. */
  .wb-float { animation: wb-float 7s ease-in-out infinite; }
  .wb-float-slow { animation: wb-float 11s ease-in-out infinite; }
  .wb-spin { animation: wb-spin 40s linear infinite; transform-origin: center; }
  .wb-draw {
    stroke-dasharray: 260;
    stroke-dashoffset: 260;
    animation: wb-draw 2.6s ease-out 0.3s forwards;
  }
}
@keyframes reveal-in {
  from { opacity: 0; transform: translateY(2rem) scale(0.985); }
  to { opacity: 1; transform: none; }
}
@keyframes wb-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-9px); }
}
@keyframes wb-spin {
  to { transform: rotate(360deg); }
}
@keyframes wb-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes scroll-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
@keyframes portrait-par {
  from { transform: translateY(22px); }
  to { transform: translateY(-22px); }
}
@keyframes marquee {
  to { transform: translateX(-50%); }
}
`
