import { durationMs, env, requireEnv, siblingUrl } from "@iedora/service-kit";

// Billing's own Kamal role; siblingUrl reconstructs a sibling's versioned URL.
// Explicit *_BASE_URL always wins (compose sets them). Auth runs in `web`.
const SELF_ROLE = "billing";

export interface BillingConfig {
  port: number;
  billingDatabaseUrl: string;
  // Audit is delivered over HTTP (never the DB): billing mints a service token
  // from auth and POSTs events to the audit service.
  auditBaseUrl: string;
  authBaseUrl: string;
  serviceClientId: string;
  serviceClientSecret: string;
  serviceJwtPublicKey: string; // base64 std raw Ed25519 (shared SERVICE_JWT_PUBLIC_KEY)
  serviceJwtIssuer: string;
  serviceAudience: string;
  periodMs: number; // billing period length (default 30d)
  // Stripe. Empty secret key = the `stripe` method is off and the service runs
  // manual-only. apiHost/apiPort point at stripe-mock for local/dev.
  stripeSecretKey: string;
  stripeApiHost: string;
  stripeApiPort: number;
}

// Var names match the deployed env/secrets, so the prod config maps over
// unchanged.
export function loadConfig(): BillingConfig {
  return {
    port: Number(env("BILLING_PORT", "8083")),
    billingDatabaseUrl: requireEnv("BILLING_DATABASE_URL"),
    auditBaseUrl: env("AUDIT_BASE_URL", "") || siblingUrl("audit", 8081, SELF_ROLE),
    authBaseUrl: env("AUTH_BASE_URL", "") || siblingUrl("web", 8080, SELF_ROLE),
    serviceClientId: requireEnv("SERVICE_CLIENT_ID"),
    serviceClientSecret: requireEnv("SERVICE_CLIENT_SECRET"),
    serviceJwtPublicKey: requireEnv("SERVICE_JWT_PUBLIC_KEY"),
    serviceJwtIssuer: requireEnv("SERVICE_JWT_ISSUER"),
    serviceAudience: env("SERVICE_AUDIENCE", "iedora-internal"),
    periodMs: durationMs(env("BILLING_PERIOD", "30d"), 30 * 864e5),
    stripeSecretKey: env("STRIPE_SECRET_KEY", ""),
    stripeApiHost: env("STRIPE_API_HOST", ""),
    stripeApiPort: Number(env("STRIPE_API_PORT", "12111")),
  };
}
