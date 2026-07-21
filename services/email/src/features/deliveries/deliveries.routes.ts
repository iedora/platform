import { zValidator } from "@hono/zod-validator"
import { type ServiceEnv, serviceAuth } from "@iedora/service-kit"
import { Hono } from "hono"

import { emailFilter } from "../../contracts.ts"
import type { EmailDeps } from "../../deps.ts"
import { queryDeliveries } from "./deliveries.query.ts"

// Vertical slice: reading the delivery log. The platform (Vantage super-admin)
// answers "was this email sent?" over the SDK by hitting this endpoint with a
// service token — never the DB. Mounted at /deliveries by the composition root.
export function deliveriesRoutes(deps: EmailDeps) {
  return new Hono<ServiceEnv>().get(
    "/deliveries",
    serviceAuth(deps.verifier),
    zValidator("query", emailFilter),
    async (c) => c.json(await queryDeliveries(deps.database.db, c.req.valid("query"))),
  )
}
