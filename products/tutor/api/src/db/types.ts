import type {
  ColumnType,
  Generated,
  Insertable,
  JSONColumnType,
  Selectable,
  Updateable,
} from "kysely"

import type {
  LessonMode,
  LessonStatus,
  LessonType,
  MessageType,
  NegotiationState,
  OwnerType,
  Party,
  PaymentStatus,
  RankTier,
  RescheduleThreadStatus,
  ReviewTag,
  TimezoneSource,
  SenderType,
  XpEventType,
} from "./enums.ts"

/**
 * Hand-owned `DB` interface — the typed source of truth for Kysely. The
 * client uses CamelCasePlugin, so these camelCase keys map to snake_case
 * columns in the migration. `kysely-codegen` can regenerate this from a
 * live DB later (see `bun run codegen`) if you'd rather it be derived.
 */

/** DB-defaulted timestamp: a Date on read, optional on insert. */
type CreatedAt = ColumnType<Date, Date | string | undefined, Date | string>
type Timestamp = ColumnType<Date, Date | string, Date | string>

interface SubjectTable {
  id: Generated<string>
  name: string
  level: string | null
  baseRatePennies: number
  createdAt: CreatedAt
}

interface RankTable {
  id: Generated<string>
  tier: RankTier
  name: string
  minXp: number
  /** Platform commission taken from the tutor per lesson at this rank (e.g. 0.2). */
  commissionRate: number
}

/** One career/credential beat on a tutor's landing-page journey. */
export interface TutorHighlight {
  /** Short heading, e.g. "Qualified Maths teacher". */
  label: string
  /** One line of context, e.g. "PGDE, University of Edinburgh". */
  body: string
}

interface TutorTable {
  id: Generated<string>
  userId: string
  displayName: string
  timezone: Generated<string>
  timezoneSource: Generated<TimezoneSource>
  tagline: string | null
  bio: string | null
  teachingStyle: string | null
  university: string | null
  degree: string | null
  avatarUrl: string | null
  /** URL slug for the tutor's personalized landing page (/t/<slug>). */
  slug: string | null
  /** Portfolio highlights for the landing-page journey timeline. */
  highlights: JSONColumnType<TutorHighlight[]> | null
  /** Public LinkedIn URL, shown on the landing page for verification. */
  linkedinUrl: string | null
  createdAt: CreatedAt
}

interface StudentTable {
  id: Generated<string>
  userId: string
  displayName: string
  timezone: Generated<string>
  timezoneSource: Generated<TimezoneSource>
  hasCompletedIntro: Generated<boolean>
  stripeCustomerId: string | null
  defaultPaymentMethodId: string | null
  // The only card data we may store: never the PAN or CVC.
  cardBrand: string | null
  cardLast4: string | null
  cardExpMonth: number | null
  cardExpYear: number | null
  learnerLevel: Generated<number>
  learnerXp: Generated<number>
  createdAt: CreatedAt
}

interface QualificationTable {
  id: Generated<string>
  tutorId: string
  subjectId: string
  rankId: string
  xp: Generated<number>
  verified: Generated<boolean>
  verifiedAt: Timestamp | null
  /** Tutor's chosen price for this qualification, in pennies. Null = use the
   *  subject's baseRatePennies as the default. */
  ratePennies: number | null
  createdAt: CreatedAt
}

interface AvailabilityTable {
  id: Generated<string>
  tutorId: string
  weekday: number
  startTime: string
  endTime: string
}

interface LessonSeriesTable {
  id: Generated<string>
  studentId: string
  tutorId: string
  qualificationId: string
  weekday: number
  localTime: string
  timezone: Generated<string>
  pricePennies: number
  status: Generated<string>
  startDate: Timestamp
  endDate: Timestamp | null
  createdAt: CreatedAt
}

interface LessonTable {
  id: Generated<string>
  seriesId: string | null
  studentId: string
  tutorId: string
  subjectId: string
  qualificationId: string | null
  type: LessonType
  mode: LessonMode
  status: Generated<LessonStatus>
  negotiation: Generated<NegotiationState>
  startsAtUtc: Timestamp
  durationMin: number
  bufferMin: Generated<number>
  pricePennies: Generated<number>
  paymentId: string | null
  /** LessonSpace join URL for the student. Minted ~10 min before the lesson. */
  roomUrl: string | null
  /** LessonSpace join URL for the tutor — carries leader (host) rights, so it is
   *  kept separate and never handed to the student. */
  roomTutorUrl: string | null
  createdAt: CreatedAt
}

interface LessonEventTable {
  id: Generated<string>
  lessonId: string
  fromStatus: string | null
  toStatus: string
  reason: string | null
  at: CreatedAt
}

interface PaymentTable {
  id: Generated<string>
  lessonId: string
  stripePaymentIntentId: string | null
  status: Generated<PaymentStatus>
  amountPennies: number
  refundedAt: Timestamp | null
  createdAt: CreatedAt
}

interface RescheduleThreadTable {
  id: Generated<string>
  lessonId: string
  status: Generated<RescheduleThreadStatus>
  openedBy: Party
  createdAt: CreatedAt
  resolvedAt: Timestamp | null
}

interface TimeProposalTable {
  id: Generated<string>
  threadId: string
  proposedBy: Party
  slots: JSONColumnType<string[]>
  message: string | null
  isActive: Generated<boolean>
  createdAt: CreatedAt
}

interface ReviewTable {
  id: Generated<string>
  lessonId: string
  studentId: string
  qualificationId: string
  rating: number
  comment: string | null
  tags: Generated<ReviewTag[]>
  /** Tutor-pinned to the top of their profile, ahead of newer reviews. */
  pinned: Generated<boolean>
  createdAt: CreatedAt
}

interface XpEventTable {
  id: Generated<string>
  qualificationId: string
  tutorId: string
  type: XpEventType
  xpDelta: number
  reason: string | null
  createdAt: CreatedAt
}

interface BadgeTable {
  id: Generated<string>
  name: string
  description: string
  criteria: string
}

interface TutorBadgeTable {
  id: Generated<string>
  tutorId: string
  badgeId: string
  awardedAt: CreatedAt
}

interface QuestTable {
  id: Generated<string>
  ownerType: OwnerType
  ownerId: string
  kind: Generated<string>
  title: string
  target: number
  progress: Generated<number>
  xpReward: number
  periodStart: Timestamp
  periodEnd: Timestamp
  completedAt: Timestamp | null
}

interface StreakTable {
  id: Generated<string>
  ownerType: OwnerType
  ownerId: string
  kind: Generated<string>
  count: Generated<number>
  lastAt: Timestamp | null
}

interface ConversationTable {
  id: Generated<string>
  tutorId: string
  studentId: string
  createdAt: CreatedAt
  lastMessageAt: CreatedAt
}

interface MessageTable {
  id: Generated<string>
  conversationId: string
  senderType: SenderType
  type: Generated<MessageType>
  body: string | null
  payload: JSONColumnType<Record<string, unknown>> | null
  refId: string | null
  createdAt: CreatedAt
}

/** What kind of profile edit a change request represents. */
export type ChangeKind = "profile" | "rate" | "add_subject" | "remove_subject"
export type ChangeStatus = "pending" | "approved" | "rejected"

interface AdminTable {
  id: Generated<string>
  email: string
  createdAt: CreatedAt
}

interface ProfileChangeTable {
  id: Generated<string>
  tutorId: string
  kind: ChangeKind
  /** The requested change plus a snapshot of the current value, for the diff. */
  payload: JSONColumnType<Record<string, unknown>>
  summary: string
  status: Generated<ChangeStatus>
  reviewerNote: string | null
  createdAt: CreatedAt
  resolvedAt: Timestamp | null
}

export interface DB {
  subject: SubjectTable
  rank: RankTable
  tutor: TutorTable
  student: StudentTable
  qualification: QualificationTable
  availability: AvailabilityTable
  lessonSeries: LessonSeriesTable
  lesson: LessonTable
  lessonEvent: LessonEventTable
  payment: PaymentTable
  rescheduleThread: RescheduleThreadTable
  timeProposal: TimeProposalTable
  review: ReviewTable
  xpEvent: XpEventTable
  badge: BadgeTable
  tutorBadge: TutorBadgeTable
  quest: QuestTable
  streak: StreakTable
  conversation: ConversationTable
  message: MessageTable
  admin: AdminTable
  profileChange: ProfileChangeTable
}

/* Row helpers per slice — Selectable = read shape, Insertable = write shape. */
export type Subject = Selectable<SubjectTable>
export type Rank = Selectable<RankTable>
export type Tutor = Selectable<TutorTable>
export type Student = Selectable<StudentTable>
export type Qualification = Selectable<QualificationTable>
export type LessonSeries = Selectable<LessonSeriesTable>
export type Lesson = Selectable<LessonTable>
export type Payment = Selectable<PaymentTable>
export type RescheduleThread = Selectable<RescheduleThreadTable>
export type TimeProposal = Selectable<TimeProposalTable>
export type Conversation = Selectable<ConversationTable>
export type Message = Selectable<MessageTable>

export type NewLesson = Insertable<LessonTable>
export type NewLessonSeries = Insertable<LessonSeriesTable>
export type NewMessage = Insertable<MessageTable>
export type NewTimeProposal = Insertable<TimeProposalTable>
export type LessonUpdate = Updateable<LessonTable>
