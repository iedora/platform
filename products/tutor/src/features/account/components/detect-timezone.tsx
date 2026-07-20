"use client"

import { useEffect, useRef } from "react"

import { browserTimezone } from "@iedora/product-tutor/lib/time"
import { updateTimezoneAction } from "../account.actions"

/**
 * Identifies the viewer's zone instead of asking them to find it in a list of 400.
 *
 * Mounted in the app shell, it reports the browser's zone once per load. The
 * server ignores it when the person has set their zone by hand, so this only ever
 * fills in a blank or follows someone who has actually moved. Renders nothing.
 */
export function DetectTimezone({ current }: { current: string }) {
  const reported = useRef(false)

  useEffect(() => {
    if (reported.current) return
    reported.current = true

    const detected = browserTimezone()
    if (!detected || detected === current) return

    // Fire-and-forget: nothing on screen depends on the result, and a failure
    // here just means we keep rendering in the zone we already had.
    void updateTimezoneAction({ timezone: detected, source: "auto" })
  }, [current])

  return null
}
