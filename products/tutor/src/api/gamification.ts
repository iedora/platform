import "server-only"

import { apiJson } from "@iedora/product-tutor/api"
import type { QuestRowDTO, StreakDTO, TutorBadgesDTO } from "@iedora/product-tutor/contracts/gamification"

export type QuestRow = QuestRowDTO

// The gamification read surface, from the service. Streak + quests are scoped to
// the authenticated student server-side, so they take no owner id here. Badges
// come back as a plain object; we rebuild the Map the UI reads.

export async function getStreak(): Promise<number> {
  const dto = await apiJson<StreakDTO>("/api/gamification/streak")
  return dto.count
}

export async function listQuests(): Promise<QuestRow[]> {
  return apiJson<QuestRowDTO[]>("/api/gamification/quests")
}

export async function listTutorBadges(tutorIds: string[]): Promise<Map<string, string[]>> {
  if (tutorIds.length === 0) return new Map()
  const dto = await apiJson<TutorBadgesDTO>("/api/gamification/tutor-badges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tutorIds }),
  })
  return new Map(Object.entries(dto.badges))
}
