import Link from "next/link"
import { Bell, GraduationCap, LayoutDashboard, MessageSquare, ShieldCheck } from "lucide-react"

import { buttonVariants } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import { getViewer } from "@iedora/product-tutor/auth/session"
import { getUnreadCount } from "@iedora/product-tutor/api/chat"

/**
 * Shared marketing header. Sticky, single line, matches the app's app-nav weight.
 *
 * Server-rendered and auth-aware: it reads the session on the server via getViewer()
 * and renders the signed-in nav (Dashboard + notifications) or the signed-out CTAs in
 * the initial HTML, with no client-side auth flash. Reading the session opts pages
 * that use this header into dynamic rendering, which is the cost of a correct SSR navbar.
 */
export async function SiteHeader() {
  const viewer = await getViewer()
  const unread = viewer ? await getUnreadCount() : 0

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-4" />
          </span>
          Tutor
        </Link>
        <nav className="flex items-center gap-1.5">
          <Link
            href="/for-tutors"
            className="me-1 hidden px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            For tutors
          </Link>
          {viewer ? (
            <>
              {/* Notifications: unread messages. Badge only shows when there's
                  something waiting, so the empty state stays calm. */}
              <Link
                href="/chat"
                aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
                className="relative grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Bell className="size-5" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href="/lessons" className={cn(buttonVariants({ size: "lg" }))}>
                <LayoutDashboard className="size-4" />
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}>
                Sign in
              </Link>
              <Link href="/chat" className={cn(buttonVariants({ size: "lg" }))}>
                <MessageSquare className="size-4" />
                Open chat
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

/**
 * Shared closing CTA. One component so the panel is identical on every marketing
 * page: same brand mark, spacing, and button. Pass a trust `note` (rendered with a
 * shield) where reassurance helps; omit it for the tutor-facing pages.
 */
export function MarketingCta({
  title,
  note,
  href,
  label,
  icon: Icon,
}: {
  title: string
  note?: string
  href: React.ComponentProps<typeof Link>["href"]
  label: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-col items-start gap-5 rounded-3xl border border-border bg-primary/5 p-8 sm:p-10">
        <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap className="size-6" />
        </span>
        <h2 className="max-w-lg text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {title}
        </h2>
        {note && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            {note}
          </p>
        )}
        <Link href={href} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-base")}>
          {Icon && <Icon className="size-4" />}
          {label}
        </Link>
      </div>
    </section>
  )
}

/** Shared marketing footer. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="size-3.5" />
          </span>
          Tutor
        </span>
        <nav className="flex items-center gap-4 text-xs text-muted-foreground">
          <Link href="/for-tutors" className="transition-colors hover:text-foreground">
            For tutors
          </Link>
          <Link href="/vs" className="transition-colors hover:text-foreground">
            Compare
          </Link>
        </nav>
      </div>
    </footer>
  )
}
