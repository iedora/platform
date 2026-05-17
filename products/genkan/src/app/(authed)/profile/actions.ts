'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/shared/db/client'
import { oauthAccessToken, oauthConsent, oauthRefreshToken } from '@/shared/db/schema'
import { auth } from '@/features/auth/adapters/better-auth-instance'

/**
 * Revoke a single OAuth grant — deletes the consent row and invalidates any
 * outstanding tokens for that (user, client) pair. The next time the user
 * signs in to that client, they'll be re-prompted (or auto-granted again if
 * the client is trusted).
 */
export async function revokeGrant(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Not signed in')

  const consentId = String(formData.get('consentId') ?? '')
  if (!consentId) throw new Error('Missing consentId')

  // Ownership check: only revoke a grant that belongs to the caller.
  const [row] = await db
    .select({ userId: oauthConsent.userId, clientId: oauthConsent.clientId })
    .from(oauthConsent)
    .where(eq(oauthConsent.id, consentId))
    .limit(1)
  if (!row || row.userId !== session.user.id) {
    throw new Error('Grant not found')
  }

  const userId = session.user.id
  const clientId = row.clientId

  await db.transaction(async (tx) => {
    await tx.delete(oauthConsent).where(eq(oauthConsent.id, consentId))
    await tx
      .delete(oauthAccessToken)
      .where(
        and(
          eq(oauthAccessToken.userId, userId),
          eq(oauthAccessToken.clientId, clientId),
        ),
      )
    await tx
      .delete(oauthRefreshToken)
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          eq(oauthRefreshToken.clientId, clientId),
        ),
      )
  })

  revalidatePath('/profile')
}
