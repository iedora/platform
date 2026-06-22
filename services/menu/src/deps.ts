import type { Auditor, Database, UserVerifier } from "@iedora/server-kit";

import type { AuditReader } from "./audit-read";
import type { TenantReader } from "./auth-client";
import type { BillingReader } from "./billing";
import type { MenuConfig } from "./config";
import type { Plans } from "./plans";
import type { Limiter } from "./ratelimit";
import type { MenuDB } from "./schema";
import type { Uploads } from "./uploads";

// Cross-slice dependencies wired once at boot. The public surface (Stage A) uses
// db + limiter; the authenticated surface adds the user verifier, auditor, and
// plan gate.
export interface MenuDeps {
  db: Database<MenuDB>;
  limiter: Limiter;
  userVerifier: UserVerifier; // verifies dashboard user access tokens
  auditor: Auditor; // OutboxWriter — restaurant lifecycle audit
  plans: Plans; // plan gate + entitlement lookups
  billing: BillingReader; // staff aggregation: a tenant's subscriptions + invoices
  audit: AuditReader; // staff aggregation: a restaurant's audit trail
  tenant: TenantReader; // staff aggregation: a restaurant's tenant + owner user
  uploads: Uploads | null; // S3 uploads; null when storage is unconfigured
  cfg: MenuConfig;
}
