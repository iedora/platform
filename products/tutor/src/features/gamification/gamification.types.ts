/** What an action returns so the client can celebrate it. */
export type ProgressionResult = {
  xpDelta: number
  /** e.g. "💎 Platinum" when a rank-up happened, else null. */
  promotedTo: string | null
  tutorName: string
  subject: string
  quests: string[]
  badges: string[]
  streak: number | null
}
