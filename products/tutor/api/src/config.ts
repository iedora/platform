import { env, requireEnv, siblingUrl } from "@iedora/service-kit"

// This service's Kamal role (the suffix in its container name); siblingUrl
// reconstructs a peer role's versioned URL from it. An explicit *_BASE_URL env
// always wins over the reconstructed name — compose/deploy sets those.
const SELF_ROLE = "tutor-api"

export interface TutorConfig {
  port: number
  tutorDatabaseUrl: string
  /** Search-path schema. Empty = the DB default (public), where the tutor DB's
   *  tables live (database-per-service); set only for a named-schema layout. */
  dbSchema: string

  // Verifies student/tutor USER access tokens (the Ed25519 key the auth service
  // signs with; its public half is shared across services).
  authJwksUrl: string // auth's JWKS endpoint — verify by key id, not a static key
  apiJwtIssuer: string
  apiJwtAudience: string

  // Outbound calls via a client-credentials service token (minted from auth):
  // billing (charges/setup/refunds), and auth itself for the mint.
  authBaseUrl: string
  billingBaseUrl: string
  serviceClientId: string
  serviceClientSecret: string

  /** HS256 secret shared with the classroom service — signs room-join URLs. */
  classroomSigningKey: string
  /** Public base URL of the classroom service (e.g. https://classroom.iedora.com). */
  classroomUrl: string

  /** Lower-cased admin allowlist (ADMIN_EMAILS); also checked against the admin table. */
  adminEmails: string[]
}

// Var names match the deployed env/secrets.
export function loadConfig(): TutorConfig {
  return {
    port: Number(env("TUTOR_API_PORT", "8085")),
    tutorDatabaseUrl: requireEnv("TUTOR_DATABASE_URL"),
    // Database-per-service: the tutor DB's tables live in the default (public)
    // schema, and the shared migration runner targets it. Empty = default
    // search_path; set only if the tutor DB moves to a named schema later.
    dbSchema: env("DB_SCHEMA", ""),
    authJwksUrl: env("AUTH_JWKS_URL", "https://auth.iedora.com/.well-known/jwks.json"),
    apiJwtIssuer: requireEnv("API_JWT_ISSUER"),
    apiJwtAudience: env("API_JWT_AUDIENCE", "iedora-api"),
    authBaseUrl: env("AUTH_BASE_URL", "") || siblingUrl("web", 8080, SELF_ROLE),
    billingBaseUrl: env("BILLING_BASE_URL", "") || siblingUrl("billing", 8083, SELF_ROLE),
    serviceClientId: requireEnv("SERVICE_CLIENT_ID"),
    serviceClientSecret: requireEnv("SERVICE_CLIENT_SECRET"),
    classroomSigningKey: env("CLASSROOM_SIGNING_KEY", ""),
    // Browser-facing (participants click it), so it's the PUBLIC classroom URL,
    // never internal container DNS. Dev defaults to the local classroom service.
    classroomUrl: env("CLASSROOM_URL", "http://localhost:8086"),
    adminEmails: env("ADMIN_EMAILS", "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  }
}
