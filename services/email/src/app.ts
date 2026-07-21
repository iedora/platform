import { createServiceApp, healthRoutes } from "@iedora/service-kit"

import type { EmailDeps } from "./deps"
import { deliveriesRoutes } from "./features/deliveries/deliveries.routes"
import { sendRoutes } from "./features/send/send.routes"

// Composition root: a service app (shared Env + global onError) with routes
// chained so the exported type carries the full route tree for Hono RPC.
// Business logic lives in features/<slice>/, never here. Send (POST /messages)
// is how producers deliver transactional emails — over HTTP, never through the DB.
export function buildApp(deps: EmailDeps) {
  return createServiceApp()
    .route("/", healthRoutes(() => deps.database.ping()))
    .route("/", sendRoutes(deps))
    .route("/", deliveriesRoutes(deps))
}

export type EmailApp = ReturnType<typeof buildApp>
