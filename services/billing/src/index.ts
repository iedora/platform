import {
  Database,
  OutboxRelay,
  OutboxWriter,
  expandFileSecrets,
  newServiceVerifier,
  parseEd25519PublicKey,
  serve,
} from "@iedora/server-kit";

import { buildApp } from "./app";
import { loadConfig } from "./config";
import type { BillingDB } from "./schema";

expandFileSecrets();
const cfg = loadConfig();

const db = new Database<BillingDB>(cfg.billingDatabaseUrl);
const auditDb = new Database(cfg.auditDatabaseUrl, { poolMax: 4 }); // relay is low-volume

const verifier = newServiceVerifier(
  await parseEd25519PublicKey(cfg.serviceJwtPublicKey),
  cfg.serviceJwtIssuer,
  cfg.serviceAudience,
);
const auditor = new OutboxWriter(db, "billing");

// Drain this service's audit outbox into the audit DB in the background.
const relay = new OutboxRelay(db, auditDb.root);
relay.start();

serve(buildApp({ db, verifier, auditor, cfg }), {
  name: "iedora-billing",
  port: cfg.port,
  onShutdown: async () => {
    await relay.stop();
    await db.close();
    await auditDb.close();
  },
});
