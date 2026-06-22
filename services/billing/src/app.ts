import { createServiceApp, healthRoutes } from "@iedora/server-kit";
import { Hono } from "hono";

import type { BillingDeps } from "./deps";
import { cancelRoutes } from "./features/cancel/cancel.routes";
import { invoicesRoutes } from "./features/invoices/invoices.routes";
import { subscribeRoutes } from "./features/subscribe/subscribe.routes";
import { subscriptionsRoutes } from "./features/subscriptions/subscriptions.routes";

// Composition root: mount each billing slice under /billing. Slices own their
// own logic (features/<slice>/); this only wires + exposes /up. Routes are
// chained so the exported type carries the full route tree for Hono RPC.
export function buildApp(deps: BillingDeps) {
  const billing = new Hono()
    .route("/", subscribeRoutes(deps))
    .route("/", cancelRoutes(deps))
    .route("/", subscriptionsRoutes(deps))
    .route("/", invoicesRoutes(deps));

  return createServiceApp()
    .route("/", healthRoutes(() => deps.db.ping()))
    .route("/billing", billing);
}

export type BillingApp = ReturnType<typeof buildApp>;
