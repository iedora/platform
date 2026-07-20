"use client"

import { cn } from "@iedora/ui/lib/utils"
import { Check, Globe } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { haptic } from "@iedora/product-tutor/lib/haptics"
import { browserTimezone, describeZone } from "@iedora/product-tutor/lib/time"
import { updateTimezoneAction } from "../account.actions"

/**
 * The real IANA list, straight from the platform, rather than a hand-kept array
 * of "common" zones that would be wrong for exactly the people this is for.
 */
function allZones(): string[] {
  const supported = Intl.supportedValuesOf?.("timeZone") ?? []
  return [...supported].sort()
}

/** "Europe/London" → "London · Europe", so a search for "dubai" or "gulf city" lands. */
function zoneLabel(tz: string): string {
  const [region, ...rest] = tz.split("/")
  const city = rest.join("/").replace(/_/g, " ")
  return city ? `${city} · ${region}` : tz
}

export function TimezonePicker({ timezone }: { timezone: string }) {
  const [value, setValue] = useState(timezone)
  // The IANA list and the device zone come from the browser, whose tz database
  // differs from the server's ICU — deriving them during SSR mismatches on hydration.
  // Start with just the saved zone (identical on both), then fill in after mount.
  const [zones, setZones] = useState<string[]>(() => [timezone])
  const [detected, setDetected] = useState<string | null>(null)
  useEffect(() => {
    setZones(allZones())
    setDetected(browserTimezone())
  }, [])

  const { execute, isPending } = useAction(updateTimezoneAction, {
    onSuccess: ({ data }) => {
      haptic()
      toast(`Times now shown in ${describeZone(data?.timezone ?? value)}`)
    },
    onError: () => toast.error("Couldn't save that. Try again."),
  })

  function save(tz: string) {
    setValue(tz)
    // Choosing from this list is a deliberate act, so it's "manual" — detection
    // will leave it alone from now on, even if they open the app from Dubai.
    execute({ timezone: tz, source: "manual" })
  }

  const saved = value === timezone
  const offerDetected = detected !== null && detected !== value && zones.includes(detected)

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <label htmlFor="timezone" className="flex items-center gap-2 text-sm font-medium">
        <Globe className="size-4 text-muted-foreground" aria-hidden />
        Timezone
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        Every lesson time in the app is shown in this zone.
      </p>

      <div className="relative mt-3">
        <select
          id="timezone"
          value={value}
          disabled={isPending}
          onChange={(e) => save(e.target.value)}
          className="h-11 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-9 text-sm outline-none focus:border-primary disabled:opacity-60"
        >
          {zones.map((tz) => (
            <option key={tz} value={tz}>
              {zoneLabel(tz)}
            </option>
          ))}
        </select>
        {isPending ? (
          <span className="absolute inset-y-0 right-3 grid place-items-center text-xs text-muted-foreground">
            Saving…
          </span>
        ) : (
          saved && (
            <Check
              className="absolute inset-y-0 right-3 my-auto size-4 text-primary"
              aria-hidden
            />
          )
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">Currently {describeZone(value)}.</p>

      {/* The common case is someone who moved, or who never set this at all. */}
      {offerDetected && (
        <button
          type="button"
          onClick={() => save(detected)}
          disabled={isPending}
          className={cn(
            "mt-3 w-full rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-primary",
            "active:scale-[0.99] disabled:opacity-60",
          )}
        >
          Your device says {describeZone(detected)} — use that
        </button>
      )}
    </div>
  )
}
