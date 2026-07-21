"use client"

import { Button } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import { Check, Star } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { toast } from "sonner"

import { celebrate } from "@iedora/product-tutor/features/gamification/gamification.celebrate"
import { haptic } from "@iedora/product-tutor/lib/haptics"
import { cancelLessonAction } from "../lessons.cancel-lesson"
import { completeLessonAction } from "../lessons.complete-lesson"
import { markNoShowAction } from "../lessons.mark-no-show"
import type { LessonRow } from "../lessons.queries"
import { ReviewSheet } from "./review-sheet"

export function LessonList({ lessons }: { lessons: LessonRow[] }) {
  if (lessons.length === 0) {
    return <p className="text-sm text-muted-foreground">No lessons yet. Book one to get started.</p>
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {lessons.map((lesson) => (
        <LessonItem key={lesson.id} lesson={lesson} />
      ))}
    </ul>
  )
}

function LessonItem({ lesson }: { lesson: LessonRow }) {
  const router = useRouter()
  // The rating the student tapped, which is also "is the sheet open".
  const [reviewing, setReviewing] = useState<number | null>(null)

  // Progression events celebrate; the rest just confirm.
  const celebrated = {
    onSuccess: ({ data }: { data?: Parameters<typeof celebrate>[0] }) => {
      celebrate(data)
      router.refresh()
    },
    onError: () => toast.error("That didn't work. Try again."),
  }
  const confirmed = (message: string) => ({
    onSuccess: () => {
      haptic()
      toast(message)
      router.refresh()
    },
    onError: () => toast.error("That didn't work. Try again."),
  })

  const complete = useAction(completeLessonAction, celebrated)
  const cancel = useAction(cancelLessonAction, confirmed("Lesson cancelled"))
  const noShow = useAction(markNoShowAction, confirmed("Marked as no-show"))
  const busy = complete.isPending || cancel.isPending || noShow.isPending

  return (
    // Stacks on phones so the lesson title never gets squeezed by the actions.
    <li className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{lesson.subject}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          {lesson.tutor} · {lesson.when}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={lesson.status} />
        {lesson.canReview ? (
          // The star you tap seeds the sheet's rating, so the quick gesture still
          // means something and you're one tap from done if that's all you want.
          <StarRating onRate={setReviewing} />
        ) : lesson.reviewed ? (
          <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <Check className="size-3.5" /> Reviewed
          </span>
        ) : null}

        {lesson.canNoShow && (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => noShow.execute({ lessonId: lesson.id, who: "tutor" })}>
              Tutor no-show
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => noShow.execute({ lessonId: lesson.id, who: "student" })}>
              Student no-show
            </Button>
          </>
        )}

        {lesson.canComplete && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => complete.execute({ lessonId: lesson.id })}>
            Mark complete
          </Button>
        )}

        {lesson.canCancel && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => cancel.execute({ lessonId: lesson.id })}>
            Cancel
          </Button>
        )}
      </div>

      {reviewing !== null && (
        <ReviewSheet
          lessonId={lesson.id}
          tutor={lesson.tutor}
          initialRating={reviewing}
          onClose={() => {
            setReviewing(null)
            router.refresh()
          }}
        />
      )}
    </li>
  )
}

function StarRating({ onRate }: { onRate: (rating: number) => void }) {
  return (
    <div className="flex items-center" role="group" aria-label="Rate this lesson">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onRate(n)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className="p-0.5 text-muted-foreground transition-colors hover:text-rating"
        >
          <Star className="size-4" />
        </button>
      ))}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "border-primary/40 bg-primary/10 text-primary"
      : status === "cancelled" || status === "late_cancelled" || status.endsWith("no_show")
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-muted text-muted-foreground"
  return (
    <span className={cn("rounded-md border px-2 py-0.5 font-mono text-[0.7rem]", tone)}>
      {status.replace(/_/g, " ")}
    </span>
  )
}
