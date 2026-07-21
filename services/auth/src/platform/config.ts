function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

function opt(name: string, fallback: string): string {
  return process.env[name] || fallback
}

/**
 * Service configuration. Everything here is deployment-wide; anything that varies
 * per tenant (providers, redirect URIs, token audience) lives in the database,
 * so one running service can serve many domains without a redeploy.
 */
export const config = {
  databaseUrl: req("DATABASE_URL"),
  /** Public base URL of this service — the JWT `iss` and OIDC discovery base. */
  issuerUrl: opt("ISSUER_URL", "http://localhost:4000").replace(/\/$/, ""),
  /**
   * Ed25519 signing key seeds (base64url, 32 bytes each), newest first. The first
   * signs new tokens; all are published in JWKS so rotation never breaks verify.
   */
  signingKeySeeds: opt("JWT_SIGNING_KEYS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  accessTtl: Number(opt("ACCESS_TTL", "900")),
  /** Sliding refresh window (seconds): each rotation extends expiry by this. */
  refreshTtl: Number(opt("REFRESH_TTL", "2592000")),
  /** Hard cap on a refresh family (seconds) regardless of sliding — after this a
   *  re-login is required. Default 90 days. */
  refreshAbsoluteTtl: Number(opt("REFRESH_ABSOLUTE_TTL", "7776000")),
  port: Number(opt("PORT", "4000")),
  /** Bearer token guarding the tenant-admin slice. Unset = admin routes disabled. */
  adminToken: process.env.ADMIN_TOKEN ?? "",
  /** Transactional email (password reset + security notices). When `host` is
   *  unset the mailer logs instead of sending — fine for local/dev. */
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(opt("SMTP_PORT", "587")),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: opt("SMTP_FROM", "iedora <no-reply@iedora.com>"),
  },
  /** Path appended to a tenant's app origin to build the reset link. */
  resetPath: opt("PASSWORD_RESET_PATH", "/reset-password"),
  /** Fallback app origin when a tenant declares no allowedOrigins. */
  appBaseUrl: process.env.APP_BASE_URL ?? "",
  /** How long a password-reset link is valid (seconds). Default 1 hour. */
  resetTtl: Number(opt("PASSWORD_RESET_TTL", "3600")),
  /** Emails granted the global `platform:admin` role (super-admin over every
   *  tenant — e.g. the Vantage console). Comma-separated, case-insensitive. The
   *  role is stamped into the access token for these users regardless of tenant
   *  or org, so any product's token carries it. Keep this list tiny. */
  platformAdmins: opt("PLATFORM_ADMINS", "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** Service clients minted as READ-ONLY: their service tokens carry `readonly`,
   *  and every service (auth `/manage`, audit, email) refuses non-GET requests
   *  from them. For a read-mostly consumer like the Vantage console — a leak of
   *  its token can't mutate anything. Comma-separated client ids. */
  readonlyClients: opt("SERVICE_READONLY_CLIENTS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Audience stamped on machine-to-machine tokens; the admin API requires it. */
  serviceAudience: opt("SERVICE_AUDIENCE", "iedora-internal"),
  /** Lifetime of a minted service token (seconds). */
  serviceTokenTtl: Number(opt("SERVICE_TOKEN_TTL", "900")),
  /** The email microservice (email-sdk POSTs queued mail here). */
  emailBaseUrl: opt("EMAIL_BASE_URL", ""),
  /** The audit microservice (audit-sdk POSTs events + reads the log here). */
  auditBaseUrl: opt("AUDIT_BASE_URL", ""),
  /** If set, emitted audit events are POSTed here by the relay. Unset = events
   *  accumulate in the outbox for a consumer to pull. */
  auditWebhookUrl: process.env.AUDIT_WEBHOOK_URL ?? "",
}

export type Config = typeof config
