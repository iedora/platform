import {
  Database,
  expandFileSecrets,
  newServiceVerifier,
  parseEd25519PublicKey,
  runRelayService,
} from "@iedora/server-kit";

import { buildApp } from "./app";
import { loadConfig } from "./config";
import { expireDueSubscriptions } from "./features/expiry/expire.service";
import type { BillingDB } from "./schema";

const EXPIRY_SWEEP_MS = 60 * 60 * 1000; // hourly

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
  build: ({ auditor }) => {
    // Expiry sweep: subscriptions past their period end drop to On Us (+ audit).
    // Run once at boot to catch anything missed while down, then hourly. The
    // sweep is idempotent and multi-instance safe (see expireDueSubscriptions).
    const sweep = () =>
      expireDueSubscriptions(db, auditor).catch((err: unknown) =>
        console.error(
          JSON.stringify({ level: "error", msg: "expiry sweep failed", err: String(err) }),
        ),
      );
    void sweep();
    setInterval(() => void sweep(), EXPIRY_SWEEP_MS).unref();
    return buildApp({ db, verifier, auditor, cfg });
  },
});
