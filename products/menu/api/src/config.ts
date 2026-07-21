import { env, requireEnv, siblingUrl } from "@iedora/service-runtime";

import type { S3Config } from "./blob.ts";

// This service's Kamal role (the suffix in its container name); server-kit's
// siblingUrl reconstructs a sibling role's versioned URL from it. An explicit
// *_BASE_URL env always wins over the reconstructed name — compose sets those.
const SELF_ROLE = "menu";

export interface MenuConfig {
  port: number;
  menuDatabaseUrl: string;
  rateLimitDisabled: boolean; // CI/e2e escape hatch

  // Verifies dashboard USER access tokens (the same Ed25519 key auth signs with;
  // its public half is shared as SERVICE_JWT_PUBLIC_KEY across the services).
  apiJwtPublicKey: string; // base64 std raw Ed25519
  apiJwtIssuer: string;
  apiJwtAudience: string;

  // Service reads via client-credentials service token (minted from auth):
  // billing (plan gate + admin invoices), auth (tenant owner), audit (trail).
  authBaseUrl: string;
  billingBaseUrl: string;
  auditBaseUrl: string;
  serviceClientId: string;
  serviceClientSecret: string;

  s3: S3Config; // object storage for uploads (empty endpoint = uploads disabled)
}

// Var names match the deployed env/secrets.
export function loadConfig(): MenuConfig {
  return {
    port: Number(env("MENU_PORT", "8084")),
    menuDatabaseUrl: requireEnv("MENU_DATABASE_URL"),
    rateLimitDisabled: env("DISABLE_RATE_LIMIT", "") !== "",
    apiJwtPublicKey: requireEnv("API_JWT_PUBLIC_KEY"),
    apiJwtIssuer: requireEnv("API_JWT_ISSUER"),
    apiJwtAudience: env("API_JWT_AUDIENCE", "iedora-api"),
    authBaseUrl: env("AUTH_BASE_URL", "") || siblingUrl("web", 8080, SELF_ROLE), // auth runs in the `web` role
    billingBaseUrl: env("BILLING_BASE_URL", "") || siblingUrl("billing", 8083, SELF_ROLE),
    auditBaseUrl: env("AUDIT_BASE_URL", "") || siblingUrl("audit", 8081, SELF_ROLE),
    serviceClientId: requireEnv("SERVICE_CLIENT_ID"),
    serviceClientSecret: requireEnv("SERVICE_CLIENT_SECRET"),
    s3: {
      endpoint: env("S3_ENDPOINT", ""),
      region: env("S3_REGION", "auto"),
      bucket: env("S3_BUCKET", ""),
      accessKey: env("S3_ACCESS_KEY", ""),
      secretKey: env("S3_SECRET_KEY", ""),
      publicUrl: env("S3_PUBLIC_URL", ""),
      forcePathStyle: env("S3_FORCE_PATH_STYLE", "") !== "",
    },
  };
}
