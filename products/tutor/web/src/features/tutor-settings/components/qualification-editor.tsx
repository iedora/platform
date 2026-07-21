"use client"

import { cn } from "@iedora/ui/lib/utils"
import { Check, Plus, Trash2 } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"

import { haptic } from "@iedora/product-tutor/lib/haptics"
import {
  addQualificationAction,
  removeQualificationAction,
  updateQualificationRateAction,
} from "../tutor-settings.service"
import type { QualificationEditorData, SubjectOption, TutorQualification } from "../tutor-settings.queries"

const MIN_POUNDS = 5
const MAX_POUNDS = 500

function money(pennies: number): string {
  return `£${(pennies / 100).toFixed(2).replace(/\.00$/, "")}`
}

/**
 * The tutor picks the subjects they teach and the price for each. Every row shows
 * what they'll actually keep after the platform commission for that subject's rank.
 */
export function QualificationEditor({ data }: { data: QualificationEditorData }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {data.offered.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">
            No subjects yet. Add one below to start taking bookings.
          </li>
        )}
        {data.offered.map((qual) => (
          <QualRow key={qual.qualificationId} qual={qual} />
        ))}
      </ul>
      <AddSubject available={data.available} />
    </div>
  )
}

function QualRow({ qual }: { qual: TutorQualification }) {
  const [pounds, setPounds] = useState(() => money(qual.pricePennies).replace("£", ""))
  const [savedPennies] = useState(qual.pricePennies)

  const rate = useAction(updateQualificationRateAction, {
    onSuccess: () => {
      haptic()
      // Not applied yet — snap back to the live price; the request is in review.
      setPounds(money(savedPennies).replace("£", ""))
      toast("Rate change sent for review")
    },
    onError: ({ error }) => {
      setPounds(money(savedPennies).replace("£", ""))
      toast.error(error.serverError ?? "Couldn't save that. Try again.")
    },
  })

  const remove = useAction(removeQualificationAction, {
    onSuccess: () => {
      haptic()
      toast(`Request to remove ${qual.subject} sent for review`)
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Couldn't remove that."),
  })

  // Net updates live as the tutor types, using the rank's commission percent.
  const typedPennies = Math.round(Number.parseFloat(pounds) * 100)
  const pennies = Number.isFinite(typedPennies) ? typedPennies : savedPennies
  const commission = Math.round((pennies * qual.commissionPct) / 100)
  const net = pennies - commission

  function commit() {
    const value = Number.parseFloat(pounds)
    const next = Math.round(value * 100)
    if (!Number.isFinite(value) || value < MIN_POUNDS || value > MAX_POUNDS) {
      toast.error(`Enter a price between £${MIN_POUNDS} and £${MAX_POUNDS}.`)
      setPounds(money(savedPennies).replace("£", ""))
      return
    }
    if (next === savedPennies) {
      setPounds(money(savedPennies).replace("£", ""))
      return
    }
    rate.execute({ qualificationId: qual.qualificationId, ratePennies: next })
  }

  return (
    <li className="flex flex-col gap-2 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{qual.subject}</div>
          <div className="text-xs text-muted-foreground">
            {qual.rank} rank · {qual.commissionPct}% platform fee
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground"
            >
              £
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_POUNDS}
              max={MAX_POUNDS}
              step={1}
              value={pounds}
              disabled={rate.isPending || remove.isPending}
              aria-label={`Price for ${qual.subject}`}
              onChange={(e) => setPounds(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur()
              }}
              className="h-11 w-24 rounded-xl border border-border bg-background pr-3 pl-7 text-sm tabular-nums outline-none focus:border-primary disabled:opacity-60"
            />
          </div>

          {qual.removable ? (
            <button
              type="button"
              onClick={() => remove.execute({ qualificationId: qual.qualificationId })}
              disabled={remove.isPending}
              aria-label={`Remove ${qual.subject}`}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
            >
              <Trash2 className="size-4" />
            </button>
          ) : (
            <span className="grid size-9 place-items-center">
              <Check
                className={cn("size-4 text-primary", rate.isPending && "opacity-0")}
                aria-hidden
              />
            </span>
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        You keep <span className="font-semibold text-foreground">{money(net)}</span> per lesson after
        commission.
      </div>
    </li>
  )
}

function AddSubject({ available }: { available: SubjectOption[] }) {
  const [subjectId, setSubjectId] = useState("")
  const { execute, isPending } = useAction(addQualificationAction, {
    onSuccess: () => {
      haptic()
      setSubjectId("")
      toast("Request to add subject sent for review")
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Couldn't add that subject."),
  })

  if (available.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <select
        value={subjectId}
        disabled={isPending}
        onChange={(e) => setSubjectId(e.target.value)}
        aria-label="Add a subject"
        className="h-11 min-w-0 flex-1 appearance-none rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
      >
        <option value="">Add a subject you teach…</option>
        {available.map((s) => (
          <option key={s.subjectId} value={s.subjectId}>
            {s.subject}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => subjectId && execute({ subjectId })}
        disabled={!subjectId || isPending}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
      >
        <Plus className="size-4" />
        Add
      </button>
    </div>
  )
}
