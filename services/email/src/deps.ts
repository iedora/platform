import type { Mailer } from "./mailer.ts"
import type { Database, ServiceVerifier } from "@iedora/service-kit"

import type { EmailDB } from "./schema.ts"

// Cross-slice dependencies wired once at boot and handed to each feature slice.
// The DB handle backs the idempotency inbox; the mailer is the SMTP transport;
// the verifier authenticates producers' service tokens.
export interface EmailDeps {
  database: Database<EmailDB>
  mailer: Mailer
  verifier: ServiceVerifier
}
