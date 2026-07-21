import { XP } from "#db/domain/status"
import { promoteRank } from "#db/domain/pricing"
import type { OwnerType, RankTier, XpEventType } from "#db/enums"
import type { Kysely } from "kysely"
import { DateTime } from "luxon"

import type { TutorDB } from "../schema"

type DB = Kysely<TutorDB>

export type QuestRow = {
  id: string
  title: string
  target: number
  progress: number
  xpReward: number
  done: boolean
}

// Quest templates, mirrored from the write engine. listQuests materializes this
// week's quests on read (idempotent upsert) so the dashboard is never empty.
const TEMPLATES: Record<
  OwnerType,
  Array<{ kind: string; title: string; target: number; xpReward: number }>
> = {
  tutor: [
    { kind: "lesson_completed", title: "Teach 3 lessons", target: 3, xpReward: 50 },
    { kind: "review_5", title: "Earn a 5★ review", target: 1, xpReward: 40 },
  ],
  student: [
    { kind: "lesson_completed", title: "Attend 2 lessons", target: 2, xpReward: 30 },
    { kind: "review_left", title: "Leave a review", target: 1, xpReward: 20 },
  ],
}

function week() {
  const start = DateTime.now().startOf("week")
  return { start: start.toJSDate(), end: start.plus({ weeks: 1 }).toJSDate() }
}

/** Creates this week's quests for an owner if they don't exist yet. */
async function ensureWeeklyQuests(db: DB, ownerType: OwnerType, ownerId: string) {
  const { start, end } = week()
  const existing = await db
    .selectFrom("quest")
    .select("id")
    .where("ownerType", "=", ownerType)
    .where("ownerId", "=", ownerId)
    .where("periodStart", "=", start)
    .executeTakeFirst()
  if (existing) return

  await db
    .insertInto("quest")
    .values(
      TEMPLATES[ownerType].map((t) => ({
        ownerType,
        ownerId,
        kind: t.kind,
        title: t.title,
        target: t.target,
        xpReward: t.xpReward,
        periodStart: start,
        periodEnd: end,
      })),
    )
    .execute()
}

export async function getStreak(
  db: DB,
  ownerType: OwnerType,
  ownerId: string,
): Promise<number> {
  const row = await db
    .selectFrom("streak")
    .select("count")
    .where("ownerType", "=", ownerType)
    .where("ownerId", "=", ownerId)
    .where("kind", "=", "weekly")
    .executeTakeFirst()
  return row?.count ?? 0
}

export async function listQuests(
  db: DB,
  ownerType: OwnerType,
  ownerId: string,
): Promise<QuestRow[]> {
  await ensureWeeklyQuests(db, ownerType, ownerId)
  const start = DateTime.now().startOf("week").toJSDate()

  const rows = await db
    .selectFrom("quest")
    .select(["id", "title", "target", "progress", "xpReward", "completedAt"])
    .where("ownerType", "=", ownerType)
    .where("ownerId", "=", ownerId)
    .where("periodStart", "=", start)
    .orderBy("title")
    .execute()

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    target: r.target,
    progress: Math.min(r.progress, r.target),
    xpReward: r.xpReward,
    done: r.completedAt !== null,
  }))
}

export async function tutorBadges(
  db: DB,
  tutorIds: string[],
): Promise<Record<string, string[]>> {
  const byTutor: Record<string, string[]> = {}
  if (tutorIds.length === 0) return byTutor

  const rows = await db
    .selectFrom("tutorBadge as tb")
    .innerJoin("badge as b", "b.id", "tb.badgeId")
    .where("tb.tutorId", "in", tutorIds)
    .select(["tb.tutorId as tutorId", "b.name as name"])
    .execute()

  for (const row of rows) {
    ;(byTutor[row.tutorId] ??= []).push(row.name)
  }
  return byTutor
}

/* ============================== write engine =============================== */

/** Quest kinds are the event names that advance them. */
export type QuestKind = "lesson_completed" | "review_5" | "review_left"

export type XpResult = {
  xp: number
  delta: number
  promoted: boolean
  fromTier: RankTier
  toTier: RankTier
}

/**
 * Awards XP to a qualification and evaluates promotion. Rank is a high-water
 * mark — `promoteRank` never demotes and gates on a minimum lessons-completed
 * count. Returns the new XP and whether a rank-up happened.
 */
export async function awardXp(
  db: DB,
  input: {
    qualificationId: string
    tutorId: string
    type: XpEventType
    /** Overrides the XP table — used by quests, whose reward varies per quest. */
    delta?: number
    reason?: string
  },
): Promise<XpResult> {
  const delta = input.delta ?? XP[input.type]

  await db
    .insertInto("xpEvent")
    .values({
      qualificationId: input.qualificationId,
      tutorId: input.tutorId,
      type: input.type,
      xpDelta: delta,
      reason: input.reason ?? null,
    })
    .execute()

  const qual = await db
    .updateTable("qualification")
    .set((eb) => ({ xp: eb("xp", "+", delta) }))
    .where("id", "=", input.qualificationId)
    .returning(["xp", "rankId"])
    .executeTakeFirstOrThrow()

  const currentRank = await db
    .selectFrom("rank")
    .select("tier")
    .where("id", "=", qual.rankId)
    .executeTakeFirstOrThrow()

  const completed = await db
    .selectFrom("lesson")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("qualificationId", "=", input.qualificationId)
    .where("status", "=", "completed")
    .executeTakeFirstOrThrow()

  const toTier = promoteRank(currentRank.tier, qual.xp, Number(completed.n))

  if (toTier !== currentRank.tier) {
    const newRank = await db
      .selectFrom("rank")
      .select("id")
      .where("tier", "=", toTier)
      .executeTakeFirstOrThrow()
    await db
      .updateTable("qualification")
      .set({ rankId: newRank.id })
      .where("id", "=", input.qualificationId)
      .execute()
  }

  return {
    xp: qual.xp,
    delta,
    promoted: toTier !== currentRank.tier,
    fromTier: currentRank.tier,
    toTier,
  }
}

/** Advances matching quests by 1; returns any that just completed. */
export async function progressQuests(
  db: DB,
  ownerType: OwnerType,
  ownerId: string,
  kind: QuestKind,
): Promise<Array<{ title: string; xpReward: number }>> {
  await ensureWeeklyQuests(db, ownerType, ownerId)
  const { start } = week()

  const quests = await db
    .selectFrom("quest")
    .selectAll()
    .where("ownerType", "=", ownerType)
    .where("ownerId", "=", ownerId)
    .where("kind", "=", kind)
    .where("periodStart", "=", start)
    .where("completedAt", "is", null)
    .execute()

  const completed: Array<{ title: string; xpReward: number }> = []
  for (const q of quests) {
    const progress = q.progress + 1
    const done = progress >= q.target
    await db
      .updateTable("quest")
      .set({ progress, completedAt: done ? new Date() : null })
      .where("id", "=", q.id)
      .execute()
    if (done) completed.push({ title: q.title, xpReward: q.xpReward })
  }
  return completed
}

/**
 * Weekly streak. Activity in the same week is a no-op; the next consecutive
 * week extends it; a gap resets it to 1.
 */
export async function updateWeeklyStreak(
  db: DB,
  ownerType: OwnerType,
  ownerId: string,
): Promise<{ count: number; extended: boolean }> {
  const now = DateTime.now()
  const thisWeek = now.startOf("week")

  const row = await db
    .selectFrom("streak")
    .selectAll()
    .where("ownerType", "=", ownerType)
    .where("ownerId", "=", ownerId)
    .where("kind", "=", "weekly")
    .executeTakeFirst()

  if (!row) {
    await db
      .insertInto("streak")
      .values({ ownerType, ownerId, kind: "weekly", count: 1, lastAt: now.toJSDate() })
      .execute()
    return { count: 1, extended: true }
  }

  const lastWeek = row.lastAt ? DateTime.fromJSDate(new Date(row.lastAt)).startOf("week") : null

  let count = row.count
  let extended = false

  if (!lastWeek) {
    count = 1
    extended = true
  } else if (+lastWeek === +thisWeek) {
    // Already counted this week.
  } else if (+lastWeek === +thisWeek.minus({ weeks: 1 })) {
    count = row.count + 1
    extended = true
  } else {
    count = 1
    extended = true
  }

  await db
    .updateTable("streak")
    .set({ count, lastAt: now.toJSDate() })
    .where("id", "=", row.id)
    .execute()

  return { count, extended }
}

/**
 * Badges are milestone-based. `criteria` is a "<metric>:<threshold>" key, so new
 * badges can be added as data without touching this evaluator.
 */
export async function evaluateTutorBadges(db: DB, tutorId: string): Promise<string[]> {
  const [lessons, fiveStars, badges, owned] = await Promise.all([
    db
      .selectFrom("lesson")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("tutorId", "=", tutorId)
      .where("status", "=", "completed")
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("review as rv")
      .innerJoin("qualification as q", "q.id", "rv.qualificationId")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("q.tutorId", "=", tutorId)
      .where("rv.rating", "=", 5)
      .executeTakeFirstOrThrow(),
    db.selectFrom("badge").selectAll().execute(),
    db.selectFrom("tutorBadge").select("badgeId").where("tutorId", "=", tutorId).execute(),
  ])

  const metrics: Record<string, number> = {
    lessons: Number(lessons.n),
    five_star: Number(fiveStars.n),
  }
  const ownedIds = new Set(owned.map((o) => o.badgeId))

  const newlyAwarded: string[] = []
  for (const badge of badges) {
    if (ownedIds.has(badge.id)) continue
    const [metric, thresholdRaw] = badge.criteria.split(":")
    const value = metrics[metric ?? ""] ?? 0
    if (value < Number(thresholdRaw)) continue

    await db.insertInto("tutorBadge").values({ tutorId, badgeId: badge.id }).execute()
    newlyAwarded.push(badge.name)
  }
  return newlyAwarded
}

/** Bumps a student's learner XP and recomputes their level (100 XP per level). */
export async function bumpLearner(db: DB, studentId: string, amount: number) {
  const s = await db
    .updateTable("student")
    .set((eb) => ({ learnerXp: eb("learnerXp", "+", amount) }))
    .where("id", "=", studentId)
    .returning("learnerXp")
    .executeTakeFirstOrThrow()
  await db
    .updateTable("student")
    .set({ learnerLevel: Math.floor(s.learnerXp / 100) + 1 })
    .where("id", "=", studentId)
    .execute()
}
