import { createServiceApp, healthRoutes } from "@iedora/server-kit";

import type { AuditDeps } from "./deps";
import { eventsRoutes } from "./features/events/events.routes";

// Composition root: a service app (shared Env + global onError) with routes
// chained so the exported type carries the full route tree for Hono RPC.
// Business logic lives in features/<slice>/, never here.
export function buildApp(deps: AuditDeps) {
  return createServiceApp()
    .route("/", healthRoutes(() => deps.database.ping()))
    .route("/obs", eventsRoutes(deps));
}

export type AuditApp = ReturnType<typeof buildApp>;
