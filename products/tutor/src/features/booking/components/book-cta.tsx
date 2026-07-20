"use client"

import { Button } from "@iedora/ui/components/ui/button"
import { ArrowDown } from "lucide-react"

import { haptic } from "@iedora/product-tutor/lib/haptics"

export const BOOKING_ANCHOR = "booking"

/**
 * The whole point of the profile is this one tap, so it sits above the fold and
 * takes you straight to the picker — no hunting down a page of tables for it.
 */
export function BookCta({ label }: { label: string }) {
  return (
    <Button
      size="lg"
      className="w-full gap-2 rounded-xl text-base font-semibold active:scale-[0.98]"
      onClick={() => {
        haptic()
        document
          .getElementById(BOOKING_ANCHOR)
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      }}
    >
      {label}
      <ArrowDown className="size-4" />
    </Button>
  )
}
