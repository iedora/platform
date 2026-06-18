import type { Auditor, Database, ServiceVerifier } from "@iedora/server-kit";

import type { BillingConfig } from "./config";
import type { BillingDB } from "./schema";

// Cross-slice dependencies wired once at boot and handed to each feature slice.
// (Service-wide infrastructure — the DB handle, token verifier, auditor — lives
// here; feature-specific logic lives in its slice under features/.)
export interface BillingDeps {
  db: Database<BillingDB>;
  verifier: ServiceVerifier; // verifies internal service tokens on every route
  auditor: Auditor; // OutboxWriter — records into the billing DB's outbox
  cfg: BillingConfig;
}
