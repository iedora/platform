import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  MessageSquare,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react"

import { buttonVariants } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import {
  BEST_KEEP_PCT,
  STARTING_COMMISSION_PCT,
  STARTING_KEEP_PCT,
} from "@iedora/product-tutor/domain/pricing"

import { MarketingCta, SiteFooter, SiteHeader } from "@iedora/product-tutor/features/marketing/site-chrome"

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <Fees />
        <Proof />
        <MarketingCta
          title="Start with a free intro. Keep going because it works."
          note="Cards secured by Stripe. Charged per session, never up front."
          href="/chat"
          label="Open chat"
          icon={MessageSquare}
        />
      </main>
      <SiteFooter />
    </div>
  )
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 pt-14 pb-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pt-20 lg:pb-16">
      <div className="flex max-w-xl flex-col items-start gap-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          Free 15-minute intro. No card needed.
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Your tutor, your lessons, all in{" "}
          <span className="text-primary">one chat.</span>
        </h1>
        <p className="text-lg text-muted-foreground text-pretty">
          Book recurring lessons, reschedule in a tap, and pay per session. Every
          step happens right in the conversation.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/chat"
            className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}
          >
            <MessageSquare className="size-4" />
            Open chat
          </Link>
          <Link
            href="/book"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-11 px-5 text-base",
            )}
          >
            Browse tutors
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-border bg-muted sm:aspect-[3/2] lg:aspect-[4/5]">
        <Image
          src="/marketing/hero.webp"
          alt="A tutor working through a lesson with a student"
          fill
          priority
          sizes="(min-width: 1024px) 460px, 100vw"
          className="object-cover"
        />
      </div>
    </section>
  )
}

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Everything in chat",
    body: "Booking, rescheduling, and payment live in the same thread as your lessons. One place, no dashboards to hunt through.",
    tinted: true,
  },
  {
    icon: CreditCard,
    title: "Pay per session",
    body: "Your card is charged just before each lesson, never months ahead. Reschedule or cancel and the charge follows.",
    tinted: false,
  },
  {
    icon: CalendarClock,
    title: "Recurring, still flexible",
    body: "Lock in a weekly slot that fits your timezone. Life happens, so propose a new time and settle it in a couple of taps.",
    tinted: false,
  },
  {
    icon: Trophy,
    title: "Level up as you learn",
    body: "Every lesson earns XP and builds a streak. Progress you can see keeps you and your tutor coming back.",
    tinted: false,
  },
]

function Features() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <h2 className="mb-8 max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        Built for how lessons actually happen
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body, tinted }) => (
          <div
            key={title}
            className={cn(
              "flex flex-col gap-3 rounded-2xl border border-border p-5 transition-colors",
              tinted ? "bg-primary/5 hover:bg-primary/10" : "bg-card hover:bg-muted",
            )}
          >
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const STEPS = [
  {
    title: "Pick a tutor",
    body: "Browse real tutors with verified credentials, reviews, and a clear per-lesson price. Start with a free 15-minute intro.",
  },
  {
    title: "Book from the chat",
    body: "Agree on a weekly time in the conversation. Add your card once, kept safe and off-session by Stripe.",
  },
  {
    title: "Show up and level up",
    body: "You are charged just before each session. Learn, earn XP, and reschedule anytime without breaking stride.",
  },
]

function Fees() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <h2 className="mb-8 max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        Fair, simple fees
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-6">
          <p className="text-sm font-semibold text-muted-foreground">Students</p>
          <p className="text-2xl font-semibold tracking-tight">No platform fee</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You pay the tutor&apos;s rate, nothing added on top. The price you see when you
            book is the price you pay.
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-primary/5 p-6">
          <p className="text-sm font-semibold text-muted-foreground">Tutors</p>
          <p className="text-2xl font-semibold tracking-tight">
            Keep {STARTING_KEEP_PCT}% to {BEST_KEEP_PCT}%
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Commission starts at {STARTING_COMMISSION_PCT}% and drops every time you rank up,
            so you keep more the better you teach.
          </p>
          <Link
            href="/for-tutors"
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            See tutor pricing and ranks
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="mb-8 max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          From hello to first lesson in minutes
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map(({ title, body }, i) => (
            <li
              key={title}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-primary font-mono text-sm font-semibold text-primary-foreground">
                {i + 1}
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

function Proof() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-8">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-border">
          <Image
            src="/marketing/avatar.webp"
            alt="Marta Ferreira"
            fill
            sizes="64px"
            className="object-cover"
          />
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-0.5 text-rating">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="size-4 fill-current" />
            ))}
          </div>
          <p className="text-lg font-medium text-balance">
            &ldquo;Booking used to be three apps and a shared calendar. Now it is
            one chat, and my son actually shows up.&rdquo;
          </p>
          <p className="text-sm text-muted-foreground">
            Marta Ferreira <span className="text-border">·</span> Parent
          </p>
        </div>
        </div>
      </div>
    </section>
  )
}

