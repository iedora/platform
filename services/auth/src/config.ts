import { durationMs, env, isProd, requireEnv, siblingUrl, type SmtpConfig } from "@iedora/menu-kit";

// Auth runs in Kamal's `web` role; siblingUrl reconstructs a sibling's versioned
// URL from that. An explicit AUDIT_BASE_URL always wins (compose sets it).
const SELF_ROLE = "web";

export interface AuthConfig {
  port: number;
  authDatabaseUrl: string;
  auditBaseUrl: string; // audit service base URL — events are POSTed, never DB-written
  jwtSeed: string;
  jwtKeyId: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTtl: string; // jose duration for the access token (the JWT exp)
  accessTtlMs: number; // same, in ms, for the response's informational expiresAt
  refreshTtlMs: number; // sliding refresh lifetime
  refreshAbsoluteTtlMs: number; // hard cap from first login
  refreshCookieName: string;
  cookieDomain: string;
  cookieSecure: boolean;
  serviceClients: string; // "id:secret,id2:secret2"
  serviceAudience: string;
  serviceTokenTtl: string;
  serviceTokenTtlMs: number;
  // Declarative identity→role assignment applied on register/login. Adding a
  // role or a grantee is config, never code. See parseRoleGrants for the format.
  roleGrants: RoleGrant[];
  // Password-reset hook.
  resetTokenTtlMs: number; // how long an emailed reset token stays valid
  resetThrottleMs: number; // min gap between reset emails per account (anti-flood)
  // The reset link's base URL is built from THIS config value, never the request
  // Host header — that defeats password-reset poisoning (host-header injection).
  resetUrlBase: string;
  // SMTP transport for account emails. `host` empty → no transport (dev logs,
  // prod drops). MailHog locally, Resend/SES/etc. in prod — pure config.
  smtp: SmtpConfig;
}

/**
 * One rule: any identity in `match` is assigned `role` on register/login.
 * A match entry is either an exact email ("alice@x.com") or a domain
 * ("@iedora.com", matching every address at that domain).
 */
export interface RoleGrant {
  role: string;
  match: string[]; // normalized lowercase: exact emails or "@domain" suffixes
}

/**
 * The role to assign `email`, or undefined if no grant matches. First matching
 * grant wins, so order rules most- to least-privileged in ROLE_GRANTS.
 */
export function grantedRole(cfg: AuthConfig, email: string): string | undefined {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  const domain = at >= 0 ? e.slice(at) : ""; // keeps the leading "@"
  for (const g of cfg.roleGrants) {
    if (g.match.some((m) => (m.startsWith("@") ? m === domain : m === e))) return g.role;
  }
  return undefined;
}

/**
 * Parses ROLE_GRANTS into rules. Grants are `;`-separated; each is
 * `role=identity,identity,…` where an identity is an exact email or a
 * `@domain`. Example:
 *   ROLE_GRANTS="admin=alice@x.com,@iedora.com; support=help@x.com"
 */
function parseRoleGrants(raw: string): RoleGrant[] {
  const grants: RoleGrant[] = [];
  for (const clause of raw.split(";")) {
    const eq = clause.indexOf("=");
    if (eq < 0) continue;
    const role = clause.slice(0, eq).trim();
    const match = [
      ...new Set(
        clause
          .slice(eq + 1)
          .split(",")
          .map((m) => m.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (role && match.length) grants.push({ role, match });
  }
  return grants;
}

// Var names match the deployed env/secrets, so the prod config maps over
// unchanged.
export function loadConfig(): AuthConfig {
  return {
    port: Number(env("AUTH_PORT", "8080")),
    authDatabaseUrl: requireEnv("AUTH_DATABASE_URL"),
    auditBaseUrl: env("AUDIT_BASE_URL", "") || siblingUrl("audit", 8081, SELF_ROLE),
    jwtSeed: requireEnv("API_JWT_PRIVATE_KEY"),
    jwtKeyId: env("API_JWT_KEY_ID", "k1"),
    jwtIssuer: requireEnv("API_JWT_ISSUER"),
    jwtAudience: env("API_JWT_AUDIENCE", "iedora-api"),
    accessTtl: env("API_ACCESS_TTL", "15m"),
    accessTtlMs: durationMs(env("API_ACCESS_TTL", "15m"), 15 * 6e4),
    refreshTtlMs: durationMs(env("API_REFRESH_TTL", "720h"), 720 * 36e5),
    refreshAbsoluteTtlMs: durationMs(env("API_REFRESH_ABSOLUTE_TTL", "2160h"), 2160 * 36e5),
    refreshCookieName: env("API_REFRESH_COOKIE_NAME", "iedora_refresh"),
    cookieDomain: env("API_COOKIE_DOMAIN", ""),
    cookieSecure: isProd(),
    serviceClients: env("SERVICE_CLIENTS", ""),
    serviceAudience: env("SERVICE_AUDIENCE", "iedora-internal"),
    serviceTokenTtl: env("SERVICE_TOKEN_TTL", "10m"),
    serviceTokenTtlMs: durationMs(env("SERVICE_TOKEN_TTL", "10m"), 10 * 6e4),
    roleGrants: parseRoleGrants(env("ROLE_GRANTS", "")),
    resetTokenTtlMs: durationMs(env("API_RESET_TOKEN_TTL", "30m"), 30 * 6e4),
    resetThrottleMs: durationMs(env("API_RESET_THROTTLE", "60s"), 6e4),
    resetUrlBase: env("RESET_URL_BASE", "https://menu.iedora.com/reset-password"),
    smtp: loadSmtp(),
  };
}

// SMTP from env. `SMTP_SECURE` defaults to true only on the implicit-TLS port
// (465); MailHog (1025) and STARTTLS (587) are non-secure. `SMTP_USER` empty =
// no auth (MailHog).
// @iedora/email's createMailer derives implicit TLS from port 465 itself, so
// there's no `secure` to set here.
function loadSmtp(): SmtpConfig {
  return {
    host: env("SMTP_HOST", ""),
    port: Number(env("SMTP_PORT", "587")),
    user: env("SMTP_USER", ""),
    pass: env("SMTP_PASS", ""),
    from: env("MAIL_FROM", "iedora <no-reply@iedora.com>"),
  };
}
