import { config } from "../../platform/config.ts"
import { db } from "../../platform/db.ts"
import { HttpError } from "../../platform/http.ts"
import { hashToken, signServiceToken } from "../../platform/tokens.ts"

/** Register a machine-to-machine client. Only the secret hash is stored; the
 *  audience defaults to the service audience the admin API checks. */
export async function registerServiceClient(input: {
  clientId: string
  secret: string
  audience?: string
  tenantId?: string | null
  name: string
}): Promise<{ clientId: string; audience: string }> {
  const audience = input.audience ?? config.serviceAudience
  await db
    .insertInto("serviceClient")
    .values({
      clientId: input.clientId,
      secretHash: hashToken(input.secret),
      audience,
      tenantId: input.tenantId ?? null,
      name: input.name,
    })
    .execute()
  return { clientId: input.clientId, audience }
}

export type ServiceTokenResponse = { accessToken: string; tokenType: "Bearer"; expiresIn: number }

/** Client-credentials grant: verify id + secret, mint a short-lived service token. */
export async function mintServiceToken(
  clientId: string,
  secret: string,
): Promise<ServiceTokenResponse> {
  const client = await db
    .selectFrom("serviceClient")
    .selectAll()
    .where("clientId", "=", clientId)
    .executeTakeFirst()
  // Generic error so a bad id and a bad secret look identical.
  if (!client || client.secretHash !== hashToken(secret)) {
    throw new HttpError(401, "invalid_client")
  }
  const { token, expiresIn } = await signServiceToken(clientId, client.audience, client.tenantId)
  return { accessToken: token, tokenType: "Bearer", expiresIn }
}
