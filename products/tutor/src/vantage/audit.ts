import { buildEnvelope } from "@iedora/audit-sdk"

import { authNext } from "@iedora/auth-sdk/next"

import { audit } from "./clients"

// Audit the auditor: a super-admin reading platform-wide data is itself a
// sensitive action, so Vantage emits an audit event per view (source "vantage",
// actor = the admin). Fired directly over the SDK with a fresh message id
// (Vantage has no outbox). An audit failure never breaks the console.
export async function logView(action: string, meta?: Record<string, unknown>): Promise<void> {
  try {
    const claims = await authNext.getClaims()
    if (!claims) return
    await audit.ingest([
      {
        messageId: crypto.randomUUID(),
        payload: buildEnvelope(
          {
            action,
            outcome: "success",
            actor: { type: "user", id: claims.sub },
            tenantId: claims.tenant,
            meta: { email: claims.email, ...meta },
          },
          "vantage",
        ) as unknown as Record<string, unknown>,
      },
    ])
  } catch {
    // best-effort — the console must render even if audit is down.
  }
}
