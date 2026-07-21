import { Hono } from "hono"

import { discovery, jwks } from "../../platform/tokens.ts"

/** Standard discovery endpoints, mounted at the root (one issuer for all tenants).
 *  External consumers verify tokens with these — no tenant scope needed. */
export const wellKnownRoutes = new Hono()
  .get("/.well-known/jwks.json", (c) => c.json(jwks()))
  .get("/.well-known/openid-configuration", (c) => c.json(discovery()))
