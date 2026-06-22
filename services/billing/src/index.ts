import {
  Database,
  expandFileSecrets,
  newServiceVerifier,
  parseEd25519PublicKey,
  runRelayService,
} from "@iedora/server-kit";

import { buildApp } from "./app";
import { loadConfig } from "./config";
import type { BillingDB } from "./schema";

expandFileSecrets();
const cfg = loadConfig();

const db = new Database<BillingDB>(cfg.billingDatabaseUrl);

const verifier = newServiceVerifier(
  await parseEd25519PublicKey(cfg.serviceJwtPublicKey),
  cfg.serviceJwtIssuer,
  cfg.serviceAudience,
);

// runRelayService owns the audit DB + outbox writer/relay + graceful shutdown.
runRelayService({
  name: "iedora-billing",
  port: cfg.port,
  source: "billing",
  db,
  auditDatabaseUrl: cfg.auditDatabaseUrl,
  build: ({ auditor }) => buildApp({ db, verifier, auditor, cfg }),
});
