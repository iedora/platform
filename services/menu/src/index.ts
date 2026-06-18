import {
  Database,
  OutboxRelay,
  OutboxWriter,
  expandFileSecrets,
  newUserVerifier,
  parseEd25519PublicKey,
  serve,
} from "@iedora/server-kit";

import { buildApp } from "./app";
import { BillingClient, ServiceTokenSource } from "./billing";
import { makeBlobClient } from "./blob";
import { loadConfig } from "./config";
import { Plans } from "./plans";
import { Limiter } from "./ratelimit";
import type { MenuDB } from "./schema";
import { Uploads } from "./uploads";

expandFileSecrets();
const cfg = loadConfig();

const db = new Database<MenuDB>(cfg.menuDatabaseUrl);
const auditDb = new Database(cfg.auditDatabaseUrl, { poolMax: 4 }); // relay is low-volume

const userVerifier = newUserVerifier(
  await parseEd25519PublicKey(cfg.apiJwtPublicKey),
  cfg.apiJwtIssuer,
  cfg.apiJwtAudience,
);
const limiter = new Limiter(db, cfg.rateLimitDisabled);
const auditor = new OutboxWriter(db, "menu");
const tokens = new ServiceTokenSource(cfg.authBaseUrl, cfg.serviceClientId, cfg.serviceClientSecret);
const plans = new Plans(new BillingClient(cfg.billingBaseUrl, tokens), db);
const blob = makeBlobClient(cfg.s3); // null when S3 is unconfigured → uploads 503
const uploads = blob ? new Uploads(db, blob) : null;

// Drain this service's audit outbox into the audit DB in the background.
const relay = new OutboxRelay(db, auditDb.root);
relay.start();

serve(buildApp({ db, limiter, userVerifier, auditor, plans, uploads, cfg }), {
  name: "iedora-menu",
  port: cfg.port,
  onShutdown: async () => {
    await relay.stop();
    await db.close();
    await auditDb.close();
  },
});
