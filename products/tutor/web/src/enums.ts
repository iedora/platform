/**
 * Enum values — the single source of truth. The Kysely `DB` interface,
 * the migrations, and the app's Zod schemas all derive from these arrays,
 * so column types, DDL, and validation can never drift apart.
 */

export const RANK_TIERS = ["bronze", "silver", "gold", "platinum", "elite"] as const
export type RankTier = (typeof RANK_TIERS)[number]

export const LESSON_TYPES = ["free_intro", "standard"] as const
export type LessonType = (typeof LESSON_TYPES)[number]

export const LESSON_MODES = ["recurring", "one_off"] as const
export type LessonMode = (typeof LESSON_MODES)[number]

export const LESSON_STATUSES = [
  "booked",
  "charge_due",
  "charging",
  "awaiting_payment",
  "paid",
  "in_progress",
  "completed",
  "payment_failed",
  "auto_released",
  "cancelled",
  "late_cancelled",
  "student_no_show",
  "tutor_no_show",
  "refunded",
] as const
export type LessonStatus = (typeof LESSON_STATUSES)[number]

export const NEGOTIATION_STATES = ["none", "awaiting_tutor", "awaiting_student"] as const
export type NegotiationState = (typeof NEGOTIATION_STATES)[number]

export const PAYMENT_STATUSES = [
  "pending",
  "action_required",
  "paid",
  "failed",
  "refunded",
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PARTIES = ["tutor", "student"] as const
export type Party = (typeof PARTIES)[number]

export const SENDER_TYPES = ["tutor", "student", "system"] as const
export type SenderType = (typeof SENDER_TYPES)[number]

export const MESSAGE_TYPES = [
  "text",
  "proposal",
  "payment_request",
  "confirmation",
  "review_request",
  "rank_up",
  "system",
  "lesson_room",
] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]

export const RESCHEDULE_THREAD_STATUSES = [
  "open",
  "confirmed",
  "cancelled",
  "expired",
] as const
export type RescheduleThreadStatus = (typeof RESCHEDULE_THREAD_STATUSES)[number]

export const XP_EVENT_TYPES = [
  "lesson_completed",
  "review_5",
  "review_4",
  "review_3",
  "review_low",
  "retention",
  "clean_month",
  "verified_credential",
  "tutor_no_show",
  "quest_reward",
] as const
export type XpEventType = (typeof XP_EVENT_TYPES)[number]

export const OWNER_TYPES = ["tutor", "student"] as const
export type OwnerType = (typeof OWNER_TYPES)[number]

/**
 * A closed vocabulary the reviewer picks from, on top of the free-text comment.
 * Free text is unskimmable at volume; counted tags are, so this is what the
 * profile shows and the prose stays one tap away.
 */
export const REVIEW_TAGS = [
  "patient",
  "explains_clearly",
  "well_prepared",
  "builds_confidence",
  "great_with_teens",
  "pushes_you",
  "always_on_time",
  "exam_focused",
] as const
export type ReviewTag = (typeof REVIEW_TAGS)[number]

export const REVIEW_TAG_LABEL: Record<ReviewTag, string> = {
  patient: "Patient",
  explains_clearly: "Explains clearly",
  well_prepared: "Well prepared",
  builds_confidence: "Builds confidence",
  great_with_teens: "Great with teens",
  pushes_you: "Pushes you",
  always_on_time: "Always on time",
  exam_focused: "Exam focused",
}

/** Whether a timezone was detected for someone or deliberately chosen by them. */
export const TIMEZONE_SOURCES = ["auto", "manual"] as const
export type TimezoneSource = (typeof TIMEZONE_SOURCES)[number]

/** Postgres enum type name -> its allowed values. Consumed by the migration. */
export const PG_ENUMS = {
  rank_tier: RANK_TIERS,
  lesson_type: LESSON_TYPES,
  lesson_mode: LESSON_MODES,
  lesson_status: LESSON_STATUSES,
  negotiation_state: NEGOTIATION_STATES,
  payment_status: PAYMENT_STATUSES,
  party: PARTIES,
  sender_type: SENDER_TYPES,
  message_type: MESSAGE_TYPES,
  reschedule_thread_status: RESCHEDULE_THREAD_STATUSES,
  xp_event_type: XP_EVENT_TYPES,
  owner_type: OWNER_TYPES,
} as const
