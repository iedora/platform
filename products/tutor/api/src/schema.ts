// The tutor service's Kysely DB types. Tutor's schema is hand-written and shared
// via #db (not codegen), so we alias it here — the same single source
// of truth the migrations are written against.
export type { DB as TutorDB } from "#db/types"
