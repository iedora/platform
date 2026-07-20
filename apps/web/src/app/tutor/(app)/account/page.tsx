import { Flame, ShieldCheck, SlidersHorizontal } from "lucide-react"
import Link from "next/link"

import { TimezonePicker } from "@iedora/product-tutor/features/account/components/timezone-picker"
import { getStreak } from "@iedora/product-tutor/api/gamification"
import { CardSetup } from "@iedora/product-tutor/features/payments/components/card-setup"
import { getSavedCard } from "@iedora/product-tutor/api/payments"
import { SignOutButton } from "@iedora/product-tutor/components/sign-out-button"
import { requireViewer } from "@iedora/product-tutor/auth/session"

export default async function AccountPage() {
  const viewer = await requireViewer()
  const admin = viewer.isAdmin
  const isStudent = viewer.studentId !== null
  // streak and card are independent; both scope to the viewer server-side.
  const [streak, card] = isStudent ? await Promise.all([getStreak(), getSavedCard()]) : [0, null]

  return (
    <div className="mx-auto max-w-2xl p-4 pb-8 sm:p-6">
      <h1 className="mb-6 text-xl font-semibold">You</h1>

      <section className="mb-6 flex items-center gap-4 rounded-xl border border-border bg-card p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-lg font-medium text-primary-foreground">
          {viewer.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium">{viewer.name}</div>
          <div className="truncate text-sm text-muted-foreground">{viewer.email}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground capitalize">
            {viewer.role}
          </div>
        </div>
      </section>

      {isStudent && (
        <section className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="font-mono text-xs text-muted-foreground">Learner level</div>
            <div className="mt-1 text-2xl font-semibold">{viewer.learnerLevel}</div>
            <div className="font-mono text-xs text-muted-foreground">{viewer.learnerXp} XP</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="font-mono text-xs text-muted-foreground">Streak</div>
            <div className="mt-1 flex items-center gap-1.5 text-2xl font-semibold">
              <Flame className="size-5 text-destructive" />
              {streak}
            </div>
            <div className="font-mono text-xs text-muted-foreground">weeks</div>
          </div>
        </section>
      )}

      {viewer.tutorId && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Your page</h2>
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Edit your public page</span>
              <span className="block text-xs text-muted-foreground">
                Profile text, subjects and rates, featured reviews
              </span>
            </span>
          </Link>
        </section>
      )}

      {admin && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Admin</h2>
          <Link
            href="/admin/approvals"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Pending changes</span>
              <span className="block text-xs text-muted-foreground">
                Review and approve tutor edits
              </span>
            </span>
          </Link>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Preferences</h2>
        <TimezonePicker timezone={viewer.timezone} />
      </section>

      {isStudent && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Payment</h2>
          <CardSetup card={card} />
        </section>
      )}

      <SignOutButton />
    </div>
  )
}
