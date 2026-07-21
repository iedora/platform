"use client"

import { toast } from "sonner"

import { haptic, hapticCelebrate } from "@iedora/product-tutor/lib/haptics"
import type { ProgressionResult } from "./gamification.types"

/**
 * Fires the dopamine spikes for a progression event. Rank-ups land last and
 * loudest, so the payoff is the thing you're left looking at.
 */
export function celebrate(result: ProgressionResult | null | undefined) {
  if (!result) {
    haptic()
    return
  }

  if (result.xpDelta !== 0) {
    const sign = result.xpDelta > 0 ? "＋" : ""
    toast(`${sign}${result.xpDelta} XP`, {
      description: `${result.tutorName} · ${result.subject}`,
      icon: "✨",
    })
  }

  for (const quest of result.quests) {
    toast(`Quest complete · ${quest}`, { icon: "🏅" })
  }

  for (const badge of result.badges) {
    toast(`Badge unlocked · ${badge}`, { icon: "🏆" })
  }

  if (result.streak && result.streak > 1) {
    toast(`${result.streak}-week streak!`, { icon: "🔥" })
  }

  if (result.promotedTo) {
    hapticCelebrate()
    toast.success(`Rank up — ${result.promotedTo}`, {
      description: `${result.tutorName} levelled up in ${result.subject}.`,
      duration: 7000,
    })
    return
  }

  haptic()
}
