import { env, requireEnv } from "@iedora/server-kit";

// Parses a Go-style duration ("30d", "720h", "15m") into milliseconds.
function durationMs(s: string, fallbackMs: number): number {
  const m = /^(\d+)(ms|s|m|h|d)$/.exec(s.trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit: Record<string, number> = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  return n * unit[m[2]!]!;
}

export interface BillingConfig {
  port: number;
  billingDatabaseUrl: string;
  auditDatabaseUrl: string; // audit DB the outbox relay drains into
  serviceJwtPublicKey: string; // base64 std raw Ed25519 (shared SERVICE_JWT_PUBLIC_KEY)
  serviceJwtIssuer: string;
  serviceAudience: string;
  periodMs: number; // billing period length (default 30d)
}

// Mirrors the Go billing Config (internal/apps/billing/config.go). Var names
// match the existing prod env/secrets so they carry over unchanged at cutover.
export function loadConfig(): BillingConfig {
  return {
    port: Number(env("BILLING_PORT", "8083")),
    billingDatabaseUrl: requireEnv("BILLING_DATABASE_URL"),
    auditDatabaseUrl: requireEnv("AUDIT_DATABASE_URL"),
    serviceJwtPublicKey: requireEnv("SERVICE_JWT_PUBLIC_KEY"),
    serviceJwtIssuer: requireEnv("SERVICE_JWT_ISSUER"),
    serviceAudience: env("SERVICE_AUDIENCE", "iedora-internal"),
    periodMs: durationMs(env("BILLING_PERIOD", "30d"), 30 * 864e5),
  };
}
