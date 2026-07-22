// Vantage's data layer — the three platform SDKs, wired once with a single
// platform-scoped service token. SERVER-ONLY: reads the service client secret
// from env; must never reach a client bundle. Import only from Server Components
// under app/vantage/.
//
// Direct SDK calls — no wrapper. auth-sdk = users/sessions, audit-sdk = what
// happened, email-sdk = what was sent. Vantage composes the three read views.
//
// Hosting this console (and its platform token) inside a product app is an
// ACCEPTED decision, not an oversight: the token is registered READ-ONLY in auth
// (SERVICE_READONLY_CLIENTS → every service refuses its non-GET requests), and
// access is gated on the platform:admin role at the edge + in the layout. So a
// tutor-web compromise can only read, never mutate. No plan to relocate.

import { AuditClient } from "@iedora/sdk/audit"
import { createManageClient } from "@iedora/auth-sdk"
import { ServiceTokenSource } from "@iedora/auth-sdk/tokens"
import { EmailClient } from "@iedora/sdk/email"

function req(name: string): string {
  const v = process.env[name]
  if (!v) {
    // Build-time stub: these clients are constructed at module load, but the
    // vantage pages are dynamic (server-rendered on demand, never prerendered),
    // so `next build` under SKIP_ENV_VALIDATION only needs the module to evaluate
    // without throwing — the stub value is never used to make a request at build.
    // At runtime the real value is required (Kamal injects it), so still throw.
    if (process.env.SKIP_ENV_VALIDATION) return ""
    throw new Error(`Vantage: missing env ${name}`)
  }
  return v
}

// One cached client-credentials source, shared by all three SDKs (same EdDSA
// service token, same audience). For a true cross-tenant super-admin this client
// must be PLATFORM-scoped (tenantId null) in the auth service's client registry —
// and, since it lives in a product app, scoped read-only where auth supports it.
const tokens = new ServiceTokenSource(
  req("AUTH_BASE_URL"),
  req("SERVICE_CLIENT_ID"),
  req("SERVICE_CLIENT_SECRET"),
)

/** auth-sdk /manage — users, sessions, organizations. */
export const manage = createManageClient({
  baseUrl: req("AUTH_BASE_URL"),
  token: () => tokens.token(),
})

/** audit-sdk — the audit log (GET /obs/events). */
export const audit = new AuditClient({ baseUrl: req("AUDIT_BASE_URL"), tokens })

/** email-sdk — the delivery log (GET /deliveries). */
export const email = new EmailClient({ baseUrl: req("EMAIL_BASE_URL"), tokens })
