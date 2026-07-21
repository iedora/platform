import type { Auditor } from "@iedora/sdk/audit";
import type { Database, ServiceVerifier } from "@iedora/service-kit";

import type { BillingConfig } from "./config.ts";
import type { PaymentKinds } from "./kinds.ts";
import type { BillingDB } from "./schema.ts";

// Cross-slice dependencies wired once at boot and handed to each feature slice.
// (Service-wide infrastructure — the DB handle, token verifier, auditor, the
// payment gateways — lives here; feature-specific logic lives in its slice.)
export interface BillingDeps {
  db: Database<BillingDB>;
  verifier: ServiceVerifier; // verifies internal service tokens on every route
  auditor: Auditor; // OutboxWriter — records into the billing DB's outbox
  kinds: PaymentKinds; // kind name → handler; each charge names its kind
  cfg: BillingConfig;
}
