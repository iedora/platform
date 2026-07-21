// The authenticated viewer's profile, resolved by the service from the Bearer
// principal. Name/email stay on the JWT claims (the web reads those locally); this
// carries the tutor/student membership the web can't derive without the DB. On a
// first authenticated request with no profile, the service bootstraps a student.

export interface SessionDTO {
  role: "student" | "tutor"
  studentId: string | null
  tutorId: string | null
  timezone: string
  /** "auto" = detected, may keep in sync; "manual" = hands-off. */
  timezoneSource: "auto" | "manual"
  isAdmin: boolean
  /** Student only (null for tutors) — the learner-XP display bits. */
  learnerLevel: number | null
  learnerXp: number | null
}
