import type { Database, ServiceVerifier } from "@iedora/service-kit"

import type { AuditDB } from "./schema.ts"

// Cross-slice dependencies wired once at boot and handed to each feature slice.
// Service-wide infrastructure — the DB handle + token verifier — lives here;
// feature-specific logic lives in its slice under features/.
export interface AuditDeps {
  database: Database<AuditDB>
  verifier: ServiceVerifier
}
