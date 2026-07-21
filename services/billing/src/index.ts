import { AuditClient } from "@iedora/sdk/audit";
import { ServiceTokenSource } from "@iedora/auth-sdk/tokens";
import {
  Database,
  expandFileSecrets,
  newServiceVerifier,
  parseEd25519PublicKey,
} from "@iedora/service-kit";

import { buildApp } from "./app";
import { runRelayService } from "./outbox";
import { loadConfig } from "./config";
import { expireDueSubscriptions } from "./features/expiry/expire.service";
import { ManualKind, type PaymentKinds } from "./kinds";
import type { BillingDB } from "./schema";
import { createStripeKind } from "./stripe-gateway";

const EXPIRY_SWEEP_MS = 60 * 60 * 1000; // hourly

expandFileSecrets();
const cfg = loadConfig();

const db = new Database<BillingDB>(cfg.billingDatabaseUrl, { camelCase: false });

const verifier = newServiceVerifier(
  await parseEd25519PublicKey(cfg.serviceJwtPublicKey),
  cfg.serviceJwtIssuer,
  cfg.serviceAudience,
);

// Audit sink: billing mints a service token from auth and POSTs events to the
// audit service (never its DB).
const auditTokens = new ServiceTokenSource(cfg.authBaseUrl, cfg.serviceClientId, cfg.serviceClientSecret);
const audit = new AuditClient({ baseUrl: cfg.auditBaseUrl, tokens: auditTokens });

// runRelayService owns the outbox writer/relay + graceful shutdown; audit events
// are delivered over HTTP via the sink above.
runRelayService({
  name: "iedora-billing",
  port: cfg.port,
  source: "billing",
  db,
  audit,
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
    // Payment kinds: manual (register-only) is always available; stripe is added
    // when a secret key is configured. Each charge explicitly names its kind.
    const stripe = createStripeKind({
      secretKey: cfg.stripeSecretKey,
      apiHost: cfg.stripeApiHost || undefined,
      apiPort: cfg.stripeApiPort,
    });
    const kinds: PaymentKinds = { manual: new ManualKind(), ...(stripe ? { stripe } : {}) };

    return buildApp({ db, verifier, auditor, kinds, cfg });
  },
});
