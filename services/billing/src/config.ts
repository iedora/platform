import { durationMs, env, requireEnv } from "@iedora/server-kit";

export interface BillingConfig {
  port: number;
  billingDatabaseUrl: string;
  dbSchema: string;
  auditSchema: string;
  auditDatabaseUrl: string; // audit DB the outbox relay drains into
  serviceJwtPublicKey: string; // base64 std raw Ed25519 (shared SERVICE_JWT_PUBLIC_KEY)
  serviceJwtIssuer: string;
  serviceAudience: string;
  periodMs: number; // billing period length (default 30d)
}

// Var names match the deployed env/secrets, so the prod config maps over
// unchanged.
export function loadConfig(): BillingConfig {
  return {
    port: Number(env("BILLING_PORT", "8083")),
    billingDatabaseUrl: requireEnv("BILLING_DATABASE_URL"),
    dbSchema: env("DB_SCHEMA", "billing"),
    auditSchema: env("AUDIT_DB_SCHEMA", "audit"),
    auditDatabaseUrl: requireEnv("AUDIT_DATABASE_URL"),
    serviceJwtPublicKey: requireEnv("SERVICE_JWT_PUBLIC_KEY"),
    serviceJwtIssuer: requireEnv("SERVICE_JWT_ISSUER"),
    serviceAudience: env("SERVICE_AUDIENCE", "iedora-internal"),
    periodMs: durationMs(env("BILLING_PERIOD", "30d"), 30 * 864e5),
  };
}
