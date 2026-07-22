import { Hono } from "hono"
import { z } from "zod"

import { emitAudit } from "../../platform/audit.ts"
import { db } from "../../platform/db.ts"
import { HttpError, reqContext, withAdmin } from "../../platform/http.ts"

const tenantSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, hyphens"),
  name: z.string().min(1).max(120),
  tokenAudience: z.string().max(120).optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
})

const providerSchema = z.object({
  providerId: z.string().min(1).max(64),
  kind: z.enum(["password", "oauth2"]),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
})

/** Tenant + provider provisioning. This is the surface that makes a new domain or
 *  external provider a config call, not a code change. */
export const tenantsRoutes = new Hono()
  .use("/admin/*", withAdmin)
  .post("/admin/tenants", async (c) => {
    const parsed = tenantSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HttpError(422, "invalid_input")
    const { slug, name, tokenAudience, allowedOrigins } = parsed.data

    // Upsert on slug so provisioning is idempotent: re-seeding reconciles name +
    // audience + origins (e.g. adding a new surface's origin) without wiping users.
    const tenant = await db
      .insertInto("tenant")
      .values({
        slug,
        name,
        tokenAudience: tokenAudience ?? slug,
        allowedOrigins: allowedOrigins ?? [],
      })
      .onConflict((oc) =>
        oc.column("slug").doUpdateSet({
          name,
          tokenAudience: tokenAudience ?? slug,
          allowedOrigins: allowedOrigins ?? [],
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow()
    await emitAudit(db, {
      tenantId: tenant.id,
      action: "auth.tenant.created",
      actorType: "admin",
      entityType: "tenant",
      entityId: tenant.id,
      newData: { slug: tenant.slug, tokenAudience: tenant.tokenAudience },
      ...reqContext(c),
    })
    return c.json(tenant, 201)
  })
  .post("/admin/tenants/:slug/providers", async (c) => {
    const tenant = await db
      .selectFrom("tenant")
      .select("id")
      .where("slug", "=", c.req.param("slug"))
      .executeTakeFirst()
    if (!tenant) throw new HttpError(404, "unknown_tenant")

    const parsed = providerSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw new HttpError(422, "invalid_input")
    const { providerId, kind, config: providerConfig, enabled } = parsed.data

    const row = await db
      .insertInto("tenantProvider")
      .values({
        tenantId: tenant.id,
        providerId,
        kind,
        config: providerConfig ?? {},
        enabled: enabled ?? true,
      })
      .onConflict((oc) =>
        oc.columns(["tenantId", "providerId"]).doUpdateSet({
          kind,
          config: providerConfig ?? {},
          enabled: enabled ?? true,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow()
    await emitAudit(db, {
      tenantId: tenant.id,
      action: "auth.tenant.provider_added",
      actorType: "admin",
      entityType: "tenant",
      entityId: tenant.id,
      metadata: { providerId, kind },
      ...reqContext(c),
    })
    return c.json(row, 201)
  })
