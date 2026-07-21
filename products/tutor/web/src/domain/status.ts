import { XP_EVENT_TYPES } from "../enums"
import type { LessonStatus, NegotiationState, Party, XpEventType } from "../enums"

/** XP awarded per action — single source of truth, shared prod + tests. */
export const XP: Record<XpEventType, number> = {
  lesson_completed: 10,
  review_5: 40,
  review_4: 15,
  review_3: 0,
  review_low: -20,
  retention: 50,
  clean_month: 30,
  verified_credential: 100,
  tutor_no_show: -50,
  quest_reward: 0, // variable — the quest's own xpReward is passed explicitly
}

/**
 * Human label for each XP event, co-located with its amount above so the "game"
 * is edited in one place. Any UI that lists XP sources (the for-tutors explainer,
 * a tutor dashboard) derives from here rather than restating the copy.
 */
export const XP_LABEL: Record<XpEventType, string> = {
  lesson_completed: "Complete a lesson",
  review_5: "Earn a 5-star review",
  review_4: "Earn a 4-star review",
  review_3: "Earn a 3-star review",
  review_low: "A one or two-star review",
  retention: "A student keeps coming back",
  clean_month: "A clean month, no cancellations",
  verified_credential: "Verify a teaching credential",
  tutor_no_show: "Miss a lesson you agreed to",
  quest_reward: "Complete a quest",
}

export type XpSource = { type: XpEventType; label: string; xp: number }

/**
 * XP events with a fixed, non-zero effect, in event order. The single list for
 * explainers and tutor UI; zero-effect (3-star) and variable (quest) events are
 * left out because they have nothing concrete to show.
 */
export const XP_SOURCES: XpSource[] = XP_EVENT_TYPES.filter((t) => XP[t] !== 0).map((t) => ({
  type: t,
  label: XP_LABEL[t],
  xp: XP[t],
}))

/** Terminal lifecycle states — no outgoing transitions. */
export const TERMINAL_STATUSES = [
  "completed",
  "auto_released",
  "cancelled",
  "late_cancelled",
  "student_no_show",
  "tutor_no_show",
  "refunded",
] as const satisfies readonly LessonStatus[]

const TERMINAL_SET = new Set<LessonStatus>(TERMINAL_STATUSES)

export function isTerminal(status: LessonStatus): boolean {
  return TERMINAL_SET.has(status)
}

/**
 * Allowed lifecycle transitions. Negotiation and payment are separate
 * dimensions (see NEGOTIATION_TURN below) and do NOT live in this map.
 */
export const LESSON_TRANSITIONS: Record<LessonStatus, readonly LessonStatus[]> = {
  booked: [
    "charge_due",
    "awaiting_payment",
    "in_progress",
    "cancelled",
    "late_cancelled",
  ],
  charge_due: ["charging", "cancelled", "late_cancelled"],
  charging: ["paid", "payment_failed"],
  awaiting_payment: ["paid", "auto_released", "cancelled", "late_cancelled"],
  payment_failed: ["paid", "auto_released"],
  paid: [
    "in_progress",
    "completed",
    "cancelled",
    "late_cancelled",
    "tutor_no_show",
    "student_no_show",
    "refunded",
  ],
  in_progress: ["completed", "tutor_no_show", "student_no_show"],
  // terminals
  completed: [],
  auto_released: [],
  cancelled: [],
  late_cancelled: [],
  student_no_show: [],
  tutor_no_show: [],
  refunded: [],
}

export function canTransition(from: LessonStatus, to: LessonStatus): boolean {
  return LESSON_TRANSITIONS[from].includes(to)
}

/**
 * Negotiation turn is derived from the last proposal's author: the OTHER
 * party is the one who must act next. A confirmed thread returns "none".
 */
export function negotiationTurn(lastProposalBy: Party | null): NegotiationState {
  if (lastProposalBy === "tutor") return "awaiting_student"
  if (lastProposalBy === "student") return "awaiting_tutor"
  return "none"
}

/** Hours-before-lesson at which each mode settles payment. */
export const PAYMENT_DEADLINE_HOURS = {
  recurring: 24,
  one_off: 48,
} as const

/** Cancelling within this window is a charged "late" cancel, not a free one. */
export const CANCELLATION_CUTOFF_HOURS = 24

/**
 * After a failed/unmade payment the student gets a recovery window. Still
 * unpaid this close to the lesson and the slot is released.
 */
export const RELEASE_CUTOFF_HOURS = 12

/** Standard lesson shape: 55 minutes taught + a 5 minute buffer. */
/**
 * Closed beta: the open marketplace (the "Find Tutors" tab and the /book browse
 * list) is hidden. Students reach tutors through a tutor's personalized landing
 * page (/t/<slug>) and stay attached via their conversations, so they can hold
 * several tutors without ever browsing. Flip to true to open browsing; later this
 * can become a per-student capability rather than a global switch.
 */
export const MARKETPLACE_ENABLED = false

export const STANDARD_DURATION_MIN = 55
export const STANDARD_BUFFER_MIN = 5
export const INTRO_DURATION_MIN = 15
