import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, ArrowLeft, Check, GraduationCap, MessageSquare } from "lucide-react"

import { buttonVariants } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import { MarketingCta, SiteFooter, SiteHeader } from "@iedora/product-tutor/features/marketing/site-chrome"
import { COMPETITORS, US, getCompetitor } from "@iedora/product-tutor/features/marketing/marketing.competitors"

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ competitor: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ competitor: string }>
}): Promise<Metadata> {
  const { competitor } = await params
  const c = getCompetitor(competitor)
  if (!c) return {}
  const title = `Tutor vs ${c.name}`
  const description = `${c.name}: ${c.oneLine} See how Tutor compares on billing, booking, tutor vetting, and who each one is best for.`
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: "/marketing/og.jpg", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: ["/marketing/og.jpg"] },
  }
}

export default async function VsPage({ params }: { params: Promise<{ competitor: string }> }) {
  const { competitor } = await params
  const c = getCompetitor(competitor)
  if (!c) notFound()

  const others = COMPETITORS.filter((o) => o.slug !== c.slug)

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-10 pb-10 sm:px-6 sm:pt-16 sm:pb-14">
          <Link
            href="/vs"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            All comparisons
          </Link>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Tutor <span className="text-muted-foreground">vs</span> {c.name}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground text-pretty">{c.tldr}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/chat" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
              <MessageSquare className="size-4" />
              Open chat
            </Link>
            <Link
              href="/book"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5 text-base")}
            >
              Browse tutors
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        {/* At a glance */}
        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">At a glance</h2>

            {/* Mobile-first: stacked per-dimension cards on phones, a real table from md up
                where there's width. No horizontal scroll on small screens. */}
            <div className="flex flex-col gap-3 md:hidden">
              {c.rows.map((row) => (
                <div key={row.dimension} className="rounded-2xl border border-border bg-card p-4">
                  <p className="mb-3 text-sm font-semibold">{row.dimension}</p>
                  <div className="flex flex-col gap-2.5">
                    <div className="rounded-xl bg-primary/5 p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                        <span className="grid size-4 place-items-center rounded bg-primary text-primary-foreground">
                          <GraduationCap className="size-2.5" />
                        </span>
                        Tutor
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">{row.us}</p>
                    </div>
                    <div className="rounded-xl border border-border p-3">
                      <p className="mb-1 text-xs font-semibold">{c.name}</p>
                      <p className="text-sm leading-relaxed text-muted-foreground">{row.them}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-[26%] p-4 text-left font-medium text-muted-foreground">Dimension</th>
                    <th className="w-[37%] bg-primary/5 p-4 text-left font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="grid size-5 place-items-center rounded bg-primary text-primary-foreground">
                          <GraduationCap className="size-3" />
                        </span>
                        Tutor
                      </span>
                    </th>
                    <th className="w-[37%] p-4 text-left font-semibold">{c.name}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {c.rows.map((row) => (
                    <tr key={row.dimension} className="align-top">
                      <td className="p-4 font-medium">{row.dimension}</td>
                      <td className="bg-primary/5 p-4 text-muted-foreground">{row.us}</td>
                      <td className="p-4 text-muted-foreground">{row.them}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Category breakdown */}
        <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight">How they compare</h2>
          <div className="flex flex-col gap-8">
            {c.categories.map((cat) => (
              <div key={cat.title}>
                <h3 className="mb-3 font-semibold">{cat.title}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-primary/5 p-5">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <Check className="size-4 text-primary" />
                      Tutor
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{cat.us}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="mb-2 text-sm font-semibold">{c.name}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{cat.them}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Who each is for */}
        <section className="border-t border-border bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight">Who each one is best for</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <GraduationCap className="size-5" />
                </span>
                <h3 className="font-semibold">Choose Tutor if you are</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{US.bestFor}</p>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6">
                <h3 className="font-semibold">Choose {c.name} if you are</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{c.whoTheyFit}</p>
                <ul className="mt-1 flex flex-col gap-1.5">
                  {c.theirStrengths.map((s) => (
                    <li key={s} className="flex gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Honest limitations. Trust beats spin on a comparison page. */}
            <div className="mt-3 rounded-2xl border border-border border-dashed p-5">
              <p className="text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Where Tutor is still behind: </span>
                {US.limitations}
              </p>
            </div>
          </div>
        </section>

        {/* How to start */}
        <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="mb-8 text-2xl font-semibold tracking-tight">Try Tutor in three steps</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              { t: "Meet a tutor free", b: "Browse verified tutors and start a free 15-minute intro. No card needed." },
              { t: "Book in the chat", b: "Agree a weekly slot in the conversation and add your card once, secured by Stripe." },
              { t: "Pay per session", b: "You are charged just before each lesson. Reschedule anytime, cancel and the charge follows." },
            ].map((s, i) => (
              <li key={s.t} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <span className="grid size-8 place-items-center rounded-lg bg-primary font-mono text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <h3 className="font-semibold">{s.t}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.b}</p>
              </li>
            ))}
          </ol>
        </section>

        <MarketingCta
          title="See the difference in one free lesson."
          note="Cards secured by Stripe. Charged per session, never up front."
          href="/chat"
          label="Open chat"
          icon={MessageSquare}
        />

        {/* Cross-links to other comparisons */}
        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Compare Tutor with others</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/vs/${o.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                Tutor vs {o.name}
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
