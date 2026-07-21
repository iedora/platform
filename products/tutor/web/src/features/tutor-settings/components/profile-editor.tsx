"use client"

import { cn } from "@iedora/ui/lib/utils"
import { Check } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"

import { haptic } from "@iedora/product-tutor/lib/haptics"
import { updateTutorProfileAction } from "../tutor-settings.service"
import type { TutorProfile } from "../tutor-settings.queries"

/**
 * Lets a tutor edit the words on their public page: the short pitch on their
 * card, their about text, and how they teach. Saves the whole form at once, and
 * only when something actually changed.
 */
export function ProfileEditor({ profile }: { profile: TutorProfile }) {
  const [tagline, setTagline] = useState(profile.tagline)
  const [bio, setBio] = useState(profile.bio)
  const [teachingStyle, setTeachingStyle] = useState(profile.teachingStyle)
  const [saved, setSaved] = useState(profile)
  const [pending, setPending] = useState(false)

  const dirty =
    tagline !== saved.tagline || bio !== saved.bio || teachingStyle !== saved.teachingStyle

  const { execute, isPending } = useAction(updateTutorProfileAction, {
    onSuccess: () => {
      haptic()
      setSaved({ ...saved, tagline, bio, teachingStyle })
      setPending(true)
      toast("Sent to admin for review")
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Couldn't save. Try again."),
  })

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <Field
        id="tagline"
        label="Card pitch"
        hint="One or two lines. This is the first thing a parent reads on your page."
        rows={2}
        value={tagline}
        maxLength={240}
        onChange={setTagline}
        disabled={isPending}
      />
      <Field
        id="bio"
        label="About me"
        hint="Your background and what you're like to learn with."
        rows={6}
        value={bio}
        maxLength={3000}
        onChange={setBio}
        disabled={isPending}
      />
      <Field
        id="teachingStyle"
        label="How I teach"
        hint="Your approach in a lesson."
        rows={5}
        value={teachingStyle}
        maxLength={3000}
        onChange={setTeachingStyle}
        disabled={isPending}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setPending(false)
            execute({ tagline, bio, teachingStyle })
          }}
          disabled={!dirty || isPending}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send for review"}
        </button>
        {!dirty && !isPending && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-4 text-primary" />
            {pending ? "Awaiting review" : "Up to date"}
          </span>
        )}
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  hint,
  rows,
  value,
  maxLength,
  onChange,
  disabled,
}: {
  id: string
  label: string
  hint: string
  rows: number
  value: string
  maxLength: number
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full resize-y rounded-xl border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-primary disabled:opacity-60",
        )}
      />
      <span className="self-end text-[11px] tabular-nums text-muted-foreground">
        {value.length}/{maxLength}
      </span>
    </div>
  )
}
