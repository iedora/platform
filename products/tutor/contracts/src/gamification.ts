import { z } from "zod"

// Wire contracts for the gamification READ surface (streak, weekly quests, tutor
// badges). All JSON-safe; the web consumes them directly. The streak/quests are
// scoped to the authenticated student (resolved server-side from the principal);
// tutor badges are a public display, keyed by the tutor ids the caller supplies.

export interface StreakDTO {
  count: number
}

export interface QuestRowDTO {
  id: string
  title: string
  target: number
  progress: number
  xpReward: number
  done: boolean
}

export const tutorBadgesInput = z.object({ tutorIds: z.array(z.string()) })
export type TutorBadgesInput = z.infer<typeof tutorBadgesInput>

export interface TutorBadgesDTO {
  /** tutorId -> badge names */
  badges: Record<string, string[]>
}
