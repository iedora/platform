import { type ServiceEnv, serviceAuth } from "@iedora/server-kit";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import * as invoices from "../../data/invoices";
import type { BillingDeps } from "../../deps";

// Vertical slice: the invoice ledger. With `tenant` → that tenant's invoices;
// without → the recent cross-tenant feed (admin), `limit` clamped server-side.
// Read-only. Mounted at /billing.
export function invoicesRoutes(deps: BillingDeps) {
  return new Hono<ServiceEnv>().get(
    "/invoices",
    serviceAuth(deps.verifier),
    zValidator(
      "query",
      z.object({
        tenant: z.string().optional(),
        limit: z.coerce.number().int().positive().optional(),
      }),
    ),
    async (c) => {
      const { tenant, limit } = c.req.valid("query");
      const rows = tenant
        ? await invoices.listByTenant(deps.db.db, tenant)
        : await invoices.listRecent(deps.db.db, limit ?? 0);
      return c.json({ invoices: rows });
    },
  );
}
