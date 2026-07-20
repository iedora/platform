import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { SiteFooter, SiteHeader } from "@iedora/product-tutor/features/marketing/site-chrome"
import { COMPETITORS } from "@iedora/product-tutor/features/marketing/marketing.competitors"

export const metadata: Metadata = {
  title: "Compare Tutor",
  description:
    "How Tutor compares to Superprof, Cambly, italki, and MyTutor on billing, booking, tutor vetting, and who each one is best for.",
}

export default function CompareHub() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pt-12 pb-8 sm:px-6 sm:pt-20">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            How Tutor compares
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground text-pretty">
            Honest, side-by-side comparisons against the platforms you are probably weighing. Where
            they win, we say so.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {COMPETITORS.map((c) => (
              <Link
                key={c.slug}
                href={`/vs/${c.slug}`}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">
                    Tutor <span className="text-muted-foreground">vs</span> {c.name}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{c.oneLine}</p>
                <span className="mt-1 text-xs text-muted-foreground/70">{c.region}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
