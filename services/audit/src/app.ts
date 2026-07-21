import { createServiceApp, healthRoutes } from "@iedora/service-kit"

import type { AuditDeps } from "./deps.ts"
import { eventsRoutes } from "./features/events/events.routes.ts"
import { ingestRoutes } from "./features/ingest/ingest.routes.ts"

// Composition root: a service app (shared Env + global onError) with routes
// chained so the exported type carries the full route tree for Hono RPC.
// Business logic lives in features/<slice>/, never here. Ingest (POST /events)
// is how producers deliver audit events — over HTTP, never through the DB.
export function buildApp(deps: AuditDeps) {
  return createServiceApp()
    .route("/", healthRoutes(() => deps.database.ping()))
    .route("/", ingestRoutes(deps))
    .route("/obs", eventsRoutes(deps))
}

export type AuditApp = ReturnType<typeof buildApp>
