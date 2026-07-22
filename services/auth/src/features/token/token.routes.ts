import { type Context, Hono } from "hono"
import { z } from "zod"

import { emitAudit } from "../../platform/audit.ts"
import { db } from "../../platform/db.ts"
import { HttpError, reqContext, validate, withAdmin } from "../../platform/http.ts"
import { mintServiceToken, registerServiceClient } from "./token.service.ts"

const registerSchema = z.object({
  clientId: z.string().min(1).max(120),
  secret: z.string().min(16).max(200),
  audience: z.string().max(120).optional(),
  tenantId: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
})

/** Read `client_id:secret` from an HTTP Basic header, else from the JSON body. */
async function readCredentials(
  c: Context,
): Promise<{ clientId: string; secret: string } | null> {
  const header = c.req.header("authorization")
  if (header?.startsWith("Basic ")) {
    const [clientId, secret] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":")
    if (clientId && secret) return { clientId, secret }
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    clientId?: string
    clientSecret?: string
  }
  if (body.clientId && body.clientSecret) return { clientId: body.clientId, secret: body.clientSecret }
  return null
}

/** Machine-to-machine tokens (root scope, no tenant). Registration is admin-only;
 *  `/token` is the client-credentials grant used by backend services. */
export const tokenRoutes = new Hono()
  .post("/admin/service-clients", withAdmin, validate("json", registerSchema), async (c) => {
    const input = c.req.valid("json")
    const result = await registerServiceClient(input)
    await emitAudit(db, {
      tenantId: input.tenantId ?? null,
      action: "auth.service_client.registered",
      actorType: "admin",
      entityType: "service_client",
      entityId: result.clientId,
      metadata: { audience: result.audience, name: input.name },
      ...reqContext(c),
    })
    return c.json(result, 201)
  })
  .post("/token", async (c) => {
    const creds = await readCredentials(c)
    if (!creds) throw new HttpError(400, "invalid_request", "client id + secret required")
    return c.json(await mintServiceToken(creds.clientId, creds.secret))
  })
