import type { Auditor, Database, UserVerifier } from "@iedora/server-kit";

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
  uploads: Uploads | null; // S3 uploads; null when storage is unconfigured
  cfg: MenuConfig;
}
