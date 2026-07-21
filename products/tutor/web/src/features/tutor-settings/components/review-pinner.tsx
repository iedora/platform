"use client"

import { cn } from "@iedora/ui/lib/utils"
import { Pin } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"

import { Stars } from "@iedora/product-tutor/features/booking/components/stars"
import { haptic } from "@iedora/product-tutor/lib/haptics"
import { toggleReviewPinAction } from "../tutor-settings.service"
import type { SettingsReview } from "../tutor-settings.queries"

/**
 * Lets a tutor pin their best reviews so they lead their public profile. Toggling
 * is optimistic; the server re-checks ownership and the pinned flag persists there.
 */
export function ReviewPinner({ reviews }: { reviews: SettingsReview[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {reviews.map((review) => (
        <ReviewRow key={review.id} review={review} />
      ))}
    </ul>
  )
}

function ReviewRow({ review }: { review: SettingsReview }) {
  const [pinned, setPinned] = useState(review.pinned)

  const { execute, isPending } = useAction(toggleReviewPinAction, {
    onSuccess: ({ data }) => {
      haptic()
      const next = data?.pinned ?? pinned
      setPinned(next)
      toast(next ? "Pinned to your profile" : "Unpinned")
    },
    onError: ({ error }) => {
      setPinned(review.pinned)
      toast.error(error.serverError ?? "Couldn't update that. Try again.")
    },
  })

  function toggle() {
    const next = !pinned
    setPinned(next) // optimistic
    execute({ reviewId: review.id, pinned: next })
  }

  return (
    <li className="flex items-start justify-between gap-3 p-3 sm:p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{review.studentName}</span>
          <Stars value={review.rating} size="size-3" />
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {review.comment}
        </p>
      </div>

      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={pinned}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
          pinned
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        <Pin className={cn("size-3.5", pinned && "fill-current")} />
        {pinned ? "Pinned" : "Pin"}
      </button>
    </li>
  )
}
