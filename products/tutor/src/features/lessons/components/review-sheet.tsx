"use client"

// Subpaths, not the "@workspace/db" barrel: the barrel re-exports the pg client,
// and a client component that touches it drags pg (and node:dns) into the browser
// bundle. These two modules are pure constants.
import { XP } from "@iedora/product-tutor/domain/status"
import { REVIEW_TAG_LABEL, REVIEW_TAGS, type ReviewTag } from "@iedora/product-tutor/enums"
import { Button } from "@iedora/ui/components/ui/button"
import { cn } from "@iedora/ui/lib/utils"
import { Star, X } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { celebrate } from "@iedora/product-tutor/features/gamification/gamification.celebrate"
import { haptic } from "@iedora/product-tutor/lib/haptics"
import { leaveReviewAction } from "../lessons.leave-review"

/** The word under the stars. The whole point of a rating is the feeling. */
const RATING_WORD: Record<number, string> = {
  1: "Not good",
  2: "Below par",
  3: "Fine",
  4: "Really good",
  5: "Brilliant",
}

function xpFor(rating: number): number {
  if (rating >= 5) return XP.review_5
  if (rating === 4) return XP.review_4
  if (rating === 3) return XP.review_3
  return XP.review_low
}

export function ReviewSheet({
  lessonId,
  tutor,
  initialRating,
  onClose,
}: {
  lessonId: string
  tutor: string
  initialRating: number
  onClose: () => void
}) {
  const [rating, setRating] = useState(initialRating)
  const [tags, setTags] = useState<ReviewTag[]>([])
  const [comment, setComment] = useState("")

  const review = useAction(leaveReviewAction, {
    onSuccess: ({ data }) => {
      celebrate(data)
      onClose()
    },
    onError: () => toast.error("That didn't work. Try again."),
  })

  // Escape closes, and the page behind must not scroll under the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const toggle = (tag: ReviewTag) => {
    haptic()
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    )
  }

  const xp = xpFor(rating)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Review your lesson with ${tutor}`}
        // Bottom sheet on a phone, centred card on a desktop. pb accounts for the
        // home indicator so the submit button isn't sitting under it.
        className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">How was it?</h2>
            <p className="text-sm text-muted-foreground">Your lesson with {tutor}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center">
          <div className="flex gap-1.5" role="group" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                aria-pressed={rating === n}
                onClick={() => {
                  haptic()
                  setRating(n)
                }}
                className="p-1 transition-transform active:scale-90"
              >
                <Star
                  className={cn(
                    "size-9 transition-colors",
                    n <= rating ? "fill-rating text-rating" : "text-muted-foreground/30",
                  )}
                />
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm font-medium">{RATING_WORD[rating]}</p>
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium">
            What stood out? <span className="text-muted-foreground">Optional</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_TAGS.map((tag) => {
              const on = tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(tag)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-95",
                    on
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {REVIEW_TAG_LABEL[tag]}
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-medium">
            Anything else? <span className="text-muted-foreground">Optional</span>
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={`What would you tell another parent about ${tutor.split(" ")[0]}?`}
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </label>

        <Button
          size="lg"
          className="mt-5 w-full rounded-xl text-base font-semibold active:scale-[0.98]"
          disabled={review.isPending}
          onClick={() =>
            review.execute({
              lessonId,
              rating,
              tags,
              comment: comment.trim() || undefined,
            })
          }
        >
          {review.isPending ? "Posting…" : "Post review"}
        </Button>

        {/* The review moves the tutor up their ladder, so say so. It's the reason
            a student bothers, and it's true. */}
        {xp > 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Earns {tutor.split(" ")[0]} +{xp} XP
          </p>
        )}
      </div>
    </div>
  )
}
