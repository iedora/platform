"use client"

import { cn } from "@iedora/ui/lib/utils"
import { Check, ExternalLink, X } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import Link from "next/link"
import { toast } from "sonner"

import { haptic } from "@iedora/product-tutor/lib/haptics"
import { approveChangeAction, rejectChangeAction } from "../admin.service"
import type { AdminChange } from "../admin.queries"

const KIND_LABEL: Record<AdminChange["kind"], string> = {
  profile: "Profile text",
  rate: "Rate change",
  add_subject: "Add subject",
  remove_subject: "Remove subject",
}

export function ApprovalList({ changes }: { changes: AdminChange[] }) {
  if (changes.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Nothing to review. New tutor edits will show up here.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {changes.map((change) => (
        <ChangeItem key={change.id} change={change} />
      ))}
    </ul>
  )
}

function ChangeItem({ change }: { change: AdminChange }) {
  const approve = useAction(approveChangeAction, {
    onSuccess: () => {
      haptic()
      toast("Approved and published")
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Couldn't approve. Try again."),
  })
  const reject = useAction(rejectChangeAction, {
    onSuccess: () => {
      haptic()
      toast("Change rejected")
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Couldn't reject. Try again."),
  })
  const busy = approve.isPending || reject.isPending

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {KIND_LABEL[change.kind]}
        </span>
        {change.tutorSlug ? (
          <Link
            href={`/t/${change.tutorSlug}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            {change.tutorName}
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </Link>
        ) : (
          <span className="text-sm font-medium">{change.tutorName}</span>
        )}
      </div>

      <p className="text-sm">{change.summary}</p>

      {change.kind === "profile" && <ProfileDiff payload={change.payload} />}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => approve.execute({ changeId: change.id })}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        >
          <Check className="size-4" />
          Approve
        </button>
        <button
          type="button"
          onClick={() => reject.execute({ changeId: change.id })}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
        >
          <X className="size-4" />
          Reject
        </button>
      </div>
    </li>
  )
}

/** Shows which profile fields changed, old value struck through above the new one. */
function ProfileDiff({ payload }: { payload: Record<string, unknown> }) {
  const prev = (payload.prev ?? {}) as Record<string, string>
  const fields: { key: string; label: string }[] = [
    { key: "tagline", label: "Card pitch" },
    { key: "bio", label: "About" },
    { key: "teachingStyle", label: "How I teach" },
  ]
  const changed = fields.filter((f) => (payload[f.key] ?? "") !== (prev[f.key] ?? ""))
  if (changed.length === 0) return null

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      {changed.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
          {prev[f.key] && (
            <span className="text-xs text-muted-foreground line-through">{prev[f.key]}</span>
          )}
          <span className={cn("text-xs", "text-foreground")}>{(payload[f.key] as string) || "(empty)"}</span>
        </div>
      ))}
    </div>
  )
}
