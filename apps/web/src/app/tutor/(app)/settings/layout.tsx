import { Clock } from "lucide-react"
import { redirect } from "next/navigation"

import { SettingsTabs } from "@iedora/product-tutor/features/tutor-settings/components/settings-tabs"
import { getTutorPendingChanges } from "@iedora/product-tutor/api/tutor-settings"
import { requireViewer } from "@iedora/product-tutor/auth/session"

/** Tutor-only settings area. Each section below is its own server-rendered page. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer()
  if (!viewer.tutorId) redirect("/account")
  const pending = await getTutorPendingChanges()

  return (
    <div className="mx-auto max-w-2xl p-4 pb-8 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold">Your page</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Changes to your public page are reviewed by our team before they go live.
      </p>

      {pending.length > 0 && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Clock className="size-4" />
            {pending.length} change{pending.length === 1 ? "" : "s"} awaiting review
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            {pending.map((c) => (
              <li key={c.id}>· {c.summary}</li>
            ))}
          </ul>
        </div>
      )}

      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </div>
  )
}
