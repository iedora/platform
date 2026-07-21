/** Short tap feedback. No-ops where the Vibration API isn't supported (iOS Safari). */
export function haptic(pattern: number | number[] = 10) {
  if (typeof navigator === "undefined") return
  if (!("vibrate" in navigator)) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Ignore — vibration is a nice-to-have.
  }
}

/** A celebratory buzz for rank-ups and unlocks. */
export function hapticCelebrate() {
  haptic([12, 40, 22])
}
