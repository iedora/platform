import {
  AuditClient,
  Database,
  expandFileSecrets,
  newUserVerifier,
  remoteJwks,
  runRelayService,
  ServiceClient,
} from "@iedora/service-runtime";

import { buildApp } from "./app.ts";
import { AuditHttpReader } from "./audit-read.ts";
import { AuthClient } from "./auth-client.ts";
import { BillingClient, ServiceTokenSource } from "./billing.ts";
import { makeBlobClient } from "./blob.ts";
import { loadConfig } from "./config.ts";
import { Plans } from "./plans.ts";
import { Limiter } from "./ratelimit.ts";
import type { MenuDB } from "./schema.ts";
import { Uploads } from "./uploads.ts";

expandFileSecrets();
const cfg = loadConfig();

const db = new Database<MenuDB>(cfg.menuDatabaseUrl, { camelCase: false });

const userVerifier = newUserVerifier(remoteJwks(cfg.authJwksUrl), cfg.apiJwtIssuer, cfg.apiJwtAudience);
const limiter = new Limiter(db, cfg.rateLimitDisabled);
const tokens = new ServiceTokenSource(cfg.authBaseUrl, cfg.serviceClientId, cfg.serviceClientSecret);
const billing = new BillingClient(cfg.billingBaseUrl, tokens);
const plans = new Plans(billing, db);
const audit = new AuditHttpReader(cfg.auditBaseUrl, tokens); // restaurant audit trail, via the audit API
const tenant = new AuthClient(cfg.authBaseUrl, tokens); // tenant + owner, via the auth API
const blob = makeBlobClient(cfg.s3); // null when S3 is unconfigured → uploads 503
const uploads = blob ? new Uploads(db, blob) : null;

// Audit sink: the relay POSTs emitted events to the audit service (never its DB),
// reusing menu's client-credentials token source.
const auditSink = new AuditClient(new ServiceClient(cfg.auditBaseUrl, tokens, "audit"));

// runRelayService owns the outbox writer/relay + graceful shutdown; audit events
// are delivered over HTTP via the sink above.
runRelayService({
  name: "iedora-menu",
  port: cfg.port,
  source: "menu",
  db,
  audit: auditSink,
  build: ({ auditor }) =>
    buildApp({ db, limiter, userVerifier, auditor, plans, billing, audit, tenant, uploads, cfg }),
});
