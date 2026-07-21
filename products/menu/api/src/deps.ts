import type { Auditor, Database, UserVerifier } from "@iedora/service-runtime";

import type { AuditReader } from "./audit-read.ts";
import type { TenantReader, UserReader } from "./auth-client.ts";
import type { BillingReader, BillingWriter } from "./billing.ts";
import type { MenuConfig } from "./config.ts";
import type { Plans } from "./plans.ts";
import type { Limiter } from "./ratelimit.ts";
import type { MenuDB } from "./schema.ts";
import type { Uploads } from "./uploads.ts";

// Cross-slice dependencies wired once at boot. The public surface (Stage A) uses
// db + limiter; the authenticated surface adds the user verifier, auditor, and
// plan gate.
export interface MenuDeps {
  db: Database<MenuDB>;
  limiter: Limiter<MenuDB>;
  userVerifier: UserVerifier; // verifies dashboard user access tokens
  auditor: Auditor; // OutboxWriter — restaurant lifecycle audit
  plans: Plans; // plan gate + entitlement lookups
  billing: BillingReader & BillingWriter; // staff: read a tenant's billing + record payments
  audit: AuditReader; // staff aggregation: a restaurant's / user's audit trail
  // staff aggregation: tenants + owners (TenantReader) and the Users CRM
  // (UserReader) — one auth-service client satisfies both.
  tenant: TenantReader & UserReader;
  uploads: Uploads | null; // S3 uploads; null when storage is unconfigured
  cfg: MenuConfig;
}
