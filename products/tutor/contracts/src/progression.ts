// What a progression event (lesson complete, review left, tutor no-show) returns
// so the client can fire its celebration toasts. All JSON-safe.
export interface ProgressionResult {
  xpDelta: number
  /** e.g. "💎 Platinum" when a rank-up happened, else null. */
  promotedTo: string | null
  tutorName: string
  subject: string
  quests: string[]
  badges: string[]
  streak: number | null
}
