import { zValidator } from "@hono/zod-validator"
import { type ServiceEnv, serviceAuth } from "@iedora/service-kit"
import { Hono } from "hono"

import { auditFilter } from "../../contracts.ts"
import type { AuditDeps } from "../../deps.ts"
import { queryAudit } from "./events.query.ts"

// Vertical slice: querying the audit log. Owns its route, its request validation
// (the zod contract, via @hono/zod-validator), and its data access
// (events.query). Mounted at /obs by the app composition root.
export function eventsRoutes(deps: AuditDeps) {
  return new Hono<ServiceEnv>().get(
    "/events",
    serviceAuth(deps.verifier),
    zValidator("query", auditFilter),
    async (c) => c.json(await queryAudit(deps.database.db, c.req.valid("query"))),
  )
}
