import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/shared/db/client'
import { oauthClient, oauthConsent } from '@/shared/db/schema'

export type UserGrant = {
  consentId: string
  clientId: string
  clientName: string
  clientUri: string | null
  scopes: string[]
  grantedAt: Date | null
}

/**
 * "Which products am I in?" — derived from the user's OAuth consents.
 * Each row is a client (app) the user authorized + the scopes granted.
 */
export async function listUserGrants(userId: string): Promise<UserGrant[]> {
  const rows = await db
    .select({
      consentId: oauthConsent.id,
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      uri: oauthClient.uri,
      scopes: oauthConsent.scopes,
      grantedAt: oauthConsent.createdAt,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(eq(oauthConsent.userId, userId))

  return rows.map((r) => ({
    consentId: r.consentId,
    clientId: r.clientId ?? '',
    clientName: r.name ?? r.clientId ?? 'Unknown app',
    clientUri: r.uri,
    scopes: r.scopes ?? [],
    grantedAt: r.grantedAt ?? null,
  }))
}
