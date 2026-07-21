import { db } from "../db"
import type { Tenant } from "../schema"
import { oauthProvider, type OAuthConfig } from "./oauth"
import { passwordProvider } from "./password"
import type { AuthProvider } from "./types"

/**
 * Resolve a provider instance for a tenant. Everything is DB-driven: a provider is
 * available only if the tenant has an enabled `tenant_provider` row for it, so the
 * same running service exposes different providers to different domains.
 */
export async function resolveProvider(
  tenant: Tenant,
  providerId: string,
): Promise<AuthProvider | null> {
  const row = await db
    .selectFrom("tenantProvider")
    .selectAll()
    .where("tenantId", "=", tenant.id)
    .where("providerId", "=", providerId)
    .where("enabled", "=", true)
    .executeTakeFirst()
  if (!row) return null

  if (row.kind === "password") return passwordProvider
  if (row.kind === "oauth2") return oauthProvider(providerId, row.config as unknown as OAuthConfig)
  return null
}

/** The providers a tenant offers, for a discovery/login-options response. */
export async function listEnabledProviders(
  tenantId: string,
): Promise<{ providerId: string; kind: string }[]> {
  return db
    .selectFrom("tenantProvider")
    .select(["providerId", "kind"])
    .where("tenantId", "=", tenantId)
    .where("enabled", "=", true)
    .orderBy("providerId")
    .execute()
}
