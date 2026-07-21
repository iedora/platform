import { HttpError, readBearer } from "@iedora/server-kit"
import { createMiddleware } from "hono/factory"

import { getTenantBySlug } from "./accounts.ts"
import { config } from "./config.ts"
import type { Tenant } from "./schema.ts"
import { verifyAccessToken } from "./tokens.ts"

// The shared Hono kernel, re-exported so every slice imports it from one place.
export { HttpError, onError, reqContext, validate } from "@iedora/server-kit"

/** Hono environment shared by every tenant-scoped slice. */
export type Env = { Variables: { tenant: Tenant } }

/** Resolves `:tenant` from the path into `c.var.tenant`. Mounted on the tenant
 *  sub-app so every slice under it is automatically scoped. */
export const withTenant = createMiddleware<Env>(async (c, next) => {
  const slug = c.req.param("tenant")
  const tenant = slug ? await getTenantBySlug(slug) : undefined
  if (!tenant) return c.json({ error: "unknown_tenant" }, 404)
  c.set("tenant", tenant)
  await next()
})

/** The authenticated caller, decoded from a verified bearer access token. */
export type AuthUser = {
  sub: string
  sid: string
  email: string | null
  name: string | null
  org: string | null
  roles: string[]
  mcp: boolean
  exp: number
}

/** Env for slices behind `withUser` (tenant from `withTenant` + the caller). */
export type AuthedEnv = { Variables: { tenant: Tenant; authUser: AuthUser } }

/** Verifies the bearer access token against the path tenant and exposes the
 *  caller as `c.var.authUser`. Mount after `withTenant`. */
export const withUser = createMiddleware<AuthedEnv>(async (c, next) => {
  const token = readBearer(c)
  if (!token) throw new HttpError(401, "missing_token")

  let payload: Record<string, unknown>
  try {
    payload = (await verifyAccessToken(token)) as Record<string, unknown>
  } catch {
    throw new HttpError(401, "invalid_token")
  }
  if (payload.tenant !== c.var.tenant.slug) throw new HttpError(403, "wrong_tenant")

  c.set("authUser", {
    sub: String(payload.sub),
    sid: String(payload.sid ?? ""),
    email: (payload.email as string) ?? null,
    name: (payload.name as string) ?? null,
    org: (payload.org as string) ?? null,
    roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
    mcp: payload.mcp === true,
    exp: Number(payload.exp),
  })
  await next()
})

/** Guards the ADMIN_TOKEN bearer surface (tenant + service-client provisioning).
 *  Unset token = the admin surface is disabled. */
export const withAdmin = createMiddleware(async (c, next) => {
  const token = readBearer(c)
  if (!config.adminToken || token !== config.adminToken) throw new HttpError(401, "unauthorized")
  await next()
})

/** The machine caller behind a verified service token. `tenantId` is null for a
 *  platform-scoped client. */
export type ServiceCaller = { clientId: string; audience: string; tenantId: string | null }

/** Env for the service-token-gated admin surface. */
export type ServiceEnv = { Variables: { service: ServiceCaller } }

/** Guards a route with a machine-to-machine token: a valid signature, `typ:"service"`,
 *  and the configured service audience. Exposes `c.var.service`. */
export const withService = createMiddleware<ServiceEnv>(async (c, next) => {
  const token = readBearer(c)
  if (!token) throw new HttpError(401, "missing_token")

  let payload: Record<string, unknown>
  try {
    payload = (await verifyAccessToken(token)) as Record<string, unknown>
  } catch {
    throw new HttpError(401, "invalid_token")
  }
  if (payload.typ !== "service" || payload.aud !== config.serviceAudience) {
    throw new HttpError(403, "service_token_required")
  }
  // Read-only service tokens (the `readonly` claim, minted for read-only clients
  // like the Vantage console) may only make safe reads — any non-GET is refused.
  if (payload.readonly === true && c.req.method !== "GET" && c.req.method !== "HEAD") {
    throw new HttpError(403, "read_only_token")
  }
  c.set("service", {
    clientId: String(payload.sub),
    audience: String(payload.aud),
    tenantId: (payload.tid as string) ?? null,
  })
  await next()
})

/** Resolve the tenant a service call operates on: the client's own tenant scope.
 *  Platform-scoped clients (no tenant) can't use the tenant admin API. */
export function serviceTenantId(service: ServiceCaller): string {
  if (!service.tenantId) throw new HttpError(400, "tenant_scope_required")
  return service.tenantId
}
