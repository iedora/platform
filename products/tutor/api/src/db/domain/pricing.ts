import type { RankTier } from "../enums.ts"

/** The rank ladder — single source of truth for both seeding and logic. */
export const RANK_ORDER = ["bronze", "silver", "gold", "platinum", "elite"] as const

/**
 * Platform commission taken from the tutor per lesson, by rank. The student always
 * pays the tutor's set rate; ranking up never changes the price, it lowers this cut
 * so the tutor keeps more. Bronze pays the most commission, elite the least.
 */
export const RANK_COMMISSION_RATE: Record<RankTier, number> = {
  bronze: 0.2,
  silver: 0.18,
  gold: 0.16,
  platinum: 0.14,
  elite: 0.12,
}

export const RANK_MIN_XP: Record<RankTier, number> = {
  bronze: 0,
  silver: 300,
  gold: 800,
  platinum: 1800,
  elite: 3500,
}

export const RANK_LABEL: Record<RankTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  elite: "Elite",
}

export const RANK_EMOJI: Record<RankTier, string> = {
  bronze: "🥉",
  silver: "🥈",
  gold: "🥇",
  platinum: "💎",
  elite: "👑",
}

/** Minimum lessons completed before a promotion can fire (anti-rush guard). */
export const MIN_LESSONS_FOR_PROMOTION = 5

/**
 * Rank is a private progression mechanic. Publicly it cashes out as one earned
 * trust signal — we deliberately don't expose XP or the ladder on profiles.
 */
export const SUPER_TUTOR_FROM: RankTier = "gold"

export function isSuperTutor(tier: RankTier): boolean {
  return RANK_ORDER.indexOf(tier) >= RANK_ORDER.indexOf(SUPER_TUTOR_FROM)
}

/**
 * The student price is simply the tutor's base rate. Rank does not change what the
 * student pays — it only moves the platform commission below. Kept as a function so
 * there's one obvious place to add fees or discounts later. Money is integer pennies.
 */
export function computePricePennies(baseRatePennies: number): number {
  return baseRatePennies
}

// The lesson fee split (commission vs tutor payout) is NOT computed here: the
// charge path sends `amountCents` + `feeRate` to the billing service, which does
// the exact integer split (@iedora/billing `splitByRate`). Keeping a second,
// float-rounded copy of that math here would only invite drift, so it's gone.

/** Highest rank whose XP threshold is satisfied. */
export function rankForXp(xp: number): RankTier {
  let reached: RankTier = "bronze"
  for (const tier of RANK_ORDER) {
    if (xp >= RANK_MIN_XP[tier]) reached = tier
  }
  return reached
}

/**
 * Promotion is automatic and one-directional — rank is a high-water mark
 * that never drops. Returns the tier the tutor should hold, given their
 * current tier, XP, and lessons completed.
 */
export function promoteRank(
  currentTier: RankTier,
  xp: number,
  lessonsCompleted: number,
): RankTier {
  const eligible = rankForXp(xp)
  const currentIdx = RANK_ORDER.indexOf(currentTier)
  const eligibleIdx = RANK_ORDER.indexOf(eligible)
  if (eligibleIdx <= currentIdx) return currentTier // never demote
  if (lessonsCompleted < MIN_LESSONS_FOR_PROMOTION) return currentTier
  return eligible
}

export function formatPennies(pennies: number): string {
  return `£${(pennies / 100).toFixed(2).replace(/\.00$/, "")}`
}

/** Platform commission at a rank, as a whole percent (e.g. 20). */
export function commissionPct(tier: RankTier): number {
  return Math.round(RANK_COMMISSION_RATE[tier] * 100)
}

/** Share the tutor keeps at a rank, as a whole percent (e.g. 80). */
export function keepPct(tier: RankTier): number {
  return 100 - commissionPct(tier)
}

export type RankInfo = {
  tier: RankTier
  label: string
  emoji: string
  minXp: number
  commissionPct: number
  keepPct: number
  superTutor: boolean
}

/**
 * The rank ladder as display rows, derived from the constants above. One source
 * for every rank/fee surface (marketing pages, in-app rank cards) so a change to
 * a threshold or commission shows up everywhere without hunting.
 */
export const RANK_LADDER: RankInfo[] = RANK_ORDER.map((tier) => ({
  tier,
  label: RANK_LABEL[tier],
  emoji: RANK_EMOJI[tier],
  minXp: RANK_MIN_XP[tier],
  commissionPct: commissionPct(tier),
  keepPct: keepPct(tier),
  superTutor: isSuperTutor(tier),
}))

/** Commission a brand-new tutor pays (highest), e.g. 20. */
export const STARTING_COMMISSION_PCT = RANK_LADDER[0]!.commissionPct
/** What a starting tutor keeps, e.g. 80. */
export const STARTING_KEEP_PCT = RANK_LADDER[0]!.keepPct
/** Best keep rate, at the top rank, e.g. 88. */
export const BEST_KEEP_PCT = RANK_LADDER[RANK_LADDER.length - 1]!.keepPct
