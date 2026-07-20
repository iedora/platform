import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BadgeCheck, TrendingDown, Wallet } from "lucide-react"

import {
  BEST_KEEP_PCT,
  MIN_LESSONS_FOR_PROMOTION,
  RANK_LADDER,
  STARTING_COMMISSION_PCT,
  STARTING_KEEP_PCT,
} from "@iedora/product-tutor/domain/pricing"
import { XP_SOURCES, type XpSource } from "@iedora/product-tutor/domain/status"

import { buttonVariants } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import { MarketingCta, SiteFooter, SiteHeader } from "@iedora/product-tutor/features/marketing/site-chrome"
import { TUTOR_ALTERNATIVES } from "@iedora/product-tutor/features/marketing/marketing.tutor-alternatives"

// Earn/lose split is a view concern; the labels and amounts come from the domain.
const XP_EARN = XP_SOURCES.filter((s) => s.xp > 0)
const XP_LOSE = XP_SOURCES.filter((s) => s.xp < 0)

export const metadata: Metadata = {
  title: "For tutors",
  description: `Teach on your terms. Students pay your rate, you keep ${STARTING_KEEP_PCT}% to ${BEST_KEEP_PCT}%, and your commission drops every time you rank up. See how our fees compare to Preply, Wyzant, italki, MyTutor and more.`,
}

const HOW = [
  {
    icon: Wallet,
    title: "You set the rate",
    body: "Price each subject yourself. Students pay exactly that, with no platform markup on top.",
  },
  {
    icon: TrendingDown,
    title: "Commission that shrinks",
    body: `We take ${STARTING_COMMISSION_PCT}% to start. Every rank lowers it, down to ${100 - BEST_KEEP_PCT}% at the top, and it never goes back up.`,
  },
  {
    icon: BadgeCheck,
    title: "Rank up by teaching",
    body: "Completed lessons earn XP toward the next rank. Reach Gold and you wear a public Super Tutor badge.",
  },
]

function SuperTutorTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-medium text-primary">
      <BadgeCheck className="size-3" />
      Super tutor
    </span>
  )
}

function XpRow({ source }: { source: XpSource }) {
  const positive = source.xp > 0
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted-foreground">{source.label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
          positive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {positive ? "+" : ""}
        {source.xp} XP
      </span>
    </li>
  )
}

export default function ForTutorsPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16 sm:pb-12">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
            Keep {STARTING_KEEP_PCT}% to {BEST_KEEP_PCT}% of your rate
          </span>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Teach on your terms. Keep more as you grow.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground text-pretty">
            Students pay the rate you set. We take a commission that starts low and drops
            every time you rank up, so the better you teach, the more you keep.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/sign-in" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
              Start teaching
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/book"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-base")}
            >
              See the marketplace
            </Link>
          </div>
        </section>

        {/* How the fee works */}
        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">How our fee works</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {HOW.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-5">
                  <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* XP and ranks — one section: the ladder up top, then how XP moves it. */}
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <h2 className="mb-1 text-2xl font-semibold tracking-tight">XP and ranks</h2>
          <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
            Every subject you teach has its own XP and rank. Teaching and happy students push
            it up; each rank you reach lowers your commission on that subject for good.
          </p>

          {/* Ladder — mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {RANK_LADDER.map((r) => (
              <div
                key={r.tier}
                className={cn(
                  "rounded-xl border border-border p-3",
                  r.superTutor ? "bg-primary/5" : "bg-card",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>{r.emoji}</span>
                    {r.label}
                    {r.superTutor && <SuperTutorTag />}
                  </span>
                  <span className="text-sm font-semibold text-primary tabular-nums">
                    Keep {r.keepPct}%
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{r.minXp === 0 ? "From the start" : `${r.minXp} XP`}</span>
                  <span>{r.commissionPct}% commission</span>
                </div>
              </div>
            ))}
          </div>

          {/* Ladder — desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Rank</th>
                  <th className="px-4 py-2.5 font-medium">XP to reach</th>
                  <th className="px-4 py-2.5 font-medium">Commission</th>
                  <th className="px-4 py-2.5 text-right font-medium">You keep</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {RANK_LADDER.map((r) => (
                  <tr key={r.tier} className={cn(r.superTutor && "bg-primary/5")}>
                    <td className="px-4 py-2.5 font-medium">
                      <span className="flex items-center gap-2">
                        <span aria-hidden>{r.emoji}</span>
                        {r.label}
                        {r.superTutor && <SuperTutorTag />}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                      {r.minXp === 0 ? "From the start" : `${r.minXp} XP`}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                      {r.commissionPct}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-primary tabular-nums">
                      {r.keepPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* How XP moves — directly beneath the ladder, tight */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="mb-1 text-sm font-semibold">Earn XP</p>
              <ul className="flex flex-col divide-y divide-border">
                {XP_EARN.map((x) => (
                  <XpRow key={x.label} source={x} />
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="mb-1 text-sm font-semibold">Lose XP</p>
              <ul className="flex flex-col divide-y divide-border">
                {XP_LOSE.map((x) => (
                  <XpRow key={x.label} source={x} />
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Ranking up: </span>
            reach a rank&apos;s XP with at least {MIN_LESSONS_FOR_PROMOTION} completed lessons in
            that subject and you are promoted automatically. Rank never drops, and each new rank
            lowers your commission permanently, so a Super Tutor badge is earned, not bought.
          </p>
        </section>

        {/* How our fees compare */}
        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
            <h2 className="mb-1 text-2xl font-semibold tracking-tight">How our fees compare</h2>
            <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
              What each platform takes from tutors. Where a rival is cheaper, we say so and name
              the trade-off.
            </p>

            {/* Mobile cards */}
            <div className="flex flex-col gap-2 md:hidden">
              {TUTOR_ALTERNATIVES.map((a) => (
                <div
                  key={a.name}
                  className={cn(
                    "rounded-2xl border p-4",
                    a.us ? "border-primary/30 bg-primary/5" : "border-border bg-card",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1.5 font-semibold">
                      {a.name}
                      {a.us && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.6rem] font-semibold text-primary-foreground">
                          You
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-semibold",
                        a.us ? "text-primary" : "text-foreground",
                      )}
                    >
                      keeps {a.keep}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">Takes {a.cut}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.note}</p>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Platform</th>
                    <th className="px-4 py-2.5 font-medium">Platform takes</th>
                    <th className="px-4 py-2.5 font-medium">You keep</th>
                    <th className="px-4 py-2.5 font-medium">The catch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {TUTOR_ALTERNATIVES.map((a) => (
                    <tr key={a.name} className={cn("align-top", a.us && "bg-primary/5")}>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {a.name}
                          {a.us && (
                            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.6rem] font-semibold text-primary-foreground">
                              You
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.cut}</td>
                      <td
                        className={cn(
                          "px-4 py-3 font-semibold whitespace-nowrap",
                          a.us ? "text-primary" : "text-foreground",
                        )}
                      >
                        {a.keep}
                      </td>
                      <td className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        {a.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <MarketingCta
          title={`Set your rate. Keep ${STARTING_KEEP_PCT}% from the start, more as you climb.`}
          href="/sign-in"
          label="Start teaching"
          icon={ArrowRight}
        />
      </main>
      <SiteFooter />
    </div>
  )
}
