import type { Jobs } from "@iedora/jobs"
import type { BillingClient } from "@iedora/sdk/billing"
import type { Database, UserVerifier } from "@iedora/service-kit"

import type { TutorConfig } from "./config.ts"
import type { LaunchSpace } from "./lib/lessonspace.ts"
import type { TutorDB } from "./schema.ts"

// Cross-slice dependencies, wired once at boot (index.ts) and passed to every
// route factory. The billing client (charges/setup/refunds) and lessonspace
// launcher (classroom rooms) are the mutation cluster's outbound edges.
export interface TutorDeps {
  db: Database<TutorDB>
  userVerifier: UserVerifier
  cfg: TutorConfig
  billing: BillingClient
  launchSpace: LaunchSpace
  /** Durable lesson timers (room open, payment settle, auto-release). */
  jobs: Jobs
}
