import type { BillingClient } from "@iedora/billing-sdk"
import type { Database, UserVerifier } from "@iedora/service-kit"

import type { TutorConfig } from "./config"
import type { LaunchSpace } from "./lib/lessonspace"
import type { TutorDB } from "./schema"

// Cross-slice dependencies, wired once at boot (index.ts) and passed to every
// route factory. The billing client (charges/setup/refunds) and lessonspace
// launcher (classroom rooms) are the mutation cluster's outbound edges.
export interface TutorDeps {
  db: Database<TutorDB>
  userVerifier: UserVerifier
  cfg: TutorConfig
  billing: BillingClient
  launchSpace: LaunchSpace
}
