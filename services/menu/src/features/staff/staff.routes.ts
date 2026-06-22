import { staffCreateRestaurant, staffImportRestaurant } from "@iedora/contracts";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";

import {
  bindQRCode,
  createQRCodes,
  deleteQRCode,
  labelQRCode,
  listQRCodes,
  listRestaurantRefs,
  unbindQRCode,
} from "../../data/qr.write";
import { restaurantById } from "../../data/restaurants";
import { staffAlerts, staffDirectory, staffOverview, staffRestaurantById } from "../../data/staff";
import type { MenuDeps } from "../../deps";
import { type MenuEnv, STAFF_ROLE, requireRole } from "../../middleware";
import { generateQRCode, normalizeQRCode, validQRCode } from "../../qr";
import { invalid, notFound } from "../../errors";
import { staffSetName } from "../../service";
import {
  staffCreateRestaurant as provisionRestaurant,
  staffImportRestaurant as provisionImport,
} from "./provision";

const MAX_BULK_QR = 500;

// Paste-JSON imports and the create form are user-facing, so a schema failure
// is user-correctable: surface it as a 422 carrying the zod issues, not the
// validator's default opaque 400. Shared by both provisioning routes.
function onInvalid(
  result: { success: boolean; error?: { issues: unknown[] } },
  c: Context,
): Response | undefined {
  if (!result.success) return c.json({ error: "invalid request", issues: result.error?.issues ?? [] }, 422);
  return undefined;
}
const AUDIT_TRAIL_LIMIT = 20; // most-recent audit events shown on the admin detail page

// Best-effort sub-fetch for the aggregation below: a failure (service down,
// token expired) is logged and degraded to `fallback` so the page still renders
// rather than 500ing. Logging is what stops a silent "empty section" from hiding
// a real outage.
async function bestEffort<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.warn(`staff restaurant detail: ${label} unavailable:`, err);
    return fallback;
  }
}

// qrBatch resolves the requested codes: an explicit (normalized, validated) code
// wins; otherwise `count` generated ones (default 1, capped).
function qrBatch(code: string, count: number): string[] {
  if (code) {
    const c = normalizeQRCode(code);
    if (!validQRCode(c)) throw invalid("code must be 1-64 chars of a-z, 0-9, _ or -");
    return [c];
  }
  let n = count > 0 ? count : 1;
  if (n > MAX_BULK_QR) n = MAX_BULK_QR;
  return Array.from({ length: n }, () => generateQRCode());
}

// Cross-tenant staff surface: oversight metrics + QR sticker administration.
// Mounted under /api/staff behind requireRole(STAFF_ROLE).
export function staffRoutes(deps: MenuDeps) {
  const db = () => deps.db.db;
  return new Hono<MenuEnv>()
    .use(requireRole(STAFF_ROLE))
    .get("/overview", async (c) => c.json(await staffOverview(db(), new Date())))
    .get("/directory", async (c) =>
      c.json({ restaurants: await staffDirectory(db(), c.req.query("q") ?? "", new Date()) }),
    )
    .get("/alerts", async (c) => c.json(await staffAlerts(db(), new Date())))
    .get("/qr-codes", async (c) => c.json({ codes: await listQRCodes(db()) }))
    .post(
      "/qr-codes",
      zValidator(
        "json",
        z.object({
          code: z.string().optional(),
          count: z.number().int().optional(),
          restaurantId: z.string().optional(),
          label: z.string().optional(),
        }),
      ),
      async (c) => {
        const { code, count, restaurantId, label } = c.req.valid("json");
        const codes = qrBatch(code ?? "", count ?? 0);
        return c.json({ inserted: await createQRCodes(db(), codes, restaurantId ?? "", label ?? "") });
      },
    )
    .post("/qr-codes/:code/bind", zValidator("json", z.object({ restaurantId: z.string() })), async (c) => {
      await bindQRCode(db(), c.req.param("code"), c.req.valid("json").restaurantId);
      return c.json({ ok: true });
    })
    .post("/qr-codes/:code/unbind", async (c) => {
      await unbindQRCode(db(), c.req.param("code"));
      return c.json({ ok: true });
    })
    .patch("/qr-codes/:code", zValidator("json", z.object({ label: z.string() })), async (c) => {
      await labelQRCode(db(), c.req.param("code"), c.req.valid("json").label);
      return c.json({ ok: true });
    })
    .delete("/qr-codes/:code", async (c) => {
      await deleteQRCode(db(), c.req.param("code"));
      return c.json({ ok: true });
    })
    .get("/restaurants", async (c) => c.json({ restaurants: await listRestaurantRefs(db()) }))
    // Tenants for the admin "assign to tenant" picker (id + name + owner), via auth.
    .get("/tenants", async (c) => c.json({ tenants: await deps.tenant.listTenants() }))
    // Provision a restaurant under an existing or brand-new tenant. The created
    // restaurant always lands on the free plan; upgrades happen via Payments.
    .post("/restaurants", zValidator("json", staffCreateRestaurant, onInvalid), async (c) =>
      c.json({ restaurant: await provisionRestaurant(deps, c.get("user").userId, c.req.valid("json")) }),
    )
    // Provision a restaurant + its full menu from a pasted JSON document. An
    // optional `tenant` name in the payload creates a new tenant; otherwise the
    // request's tenantId is used.
    .post("/restaurants/import", zValidator("json", staffImportRestaurant, onInvalid), async (c) =>
      c.json({ restaurant: await provisionImport(deps, c.get("user").userId, c.req.valid("json")) }),
    )
    // Aggregated restaurant detail for the admin pages: the core record + menus +
    // 14-day trend (from this DB), the tenant's billing (subscriptions + invoices,
    // via the billing service), the restaurant's audit trail (via the audit API),
    // and the tenant + owner (via the auth API). The core record is required (404s
    // for an unknown id); the three cross-service reads are best-effort and degrade
    // to empty/null with a logged warning rather than failing the page.
    .get("/restaurants/:id", async (c) => {
      const id = c.req.param("id");
      const detail = await staffRestaurantById(db(), id, new Date());
      const tenantId = detail.restaurant.tenantId;
      const [subscriptions, invoices, audit, tenant] = await Promise.all([
        bestEffort("billing.subscriptions", deps.billing.subscriptions(tenantId), []),
        bestEffort("billing.invoices", deps.billing.invoices(tenantId), []),
        bestEffort("audit", deps.audit.forTarget(id, AUDIT_TRAIL_LIMIT), []),
        bestEffort("tenant", deps.tenant.tenant(tenantId), null),
      ]);
      return c.json({ ...detail, billing: { subscriptions, invoices }, audit, tenant });
    })
    // Staff identity override: a privileged rename of the friendly name,
    // cross-tenant by id. The owner-scoped builder still owns menu content; this
    // is the one identity field staff may correct. Audited via staffSetName.
    .patch(
      "/restaurants/:id",
      zValidator("json", z.object({ name: z.string() })),
      async (c) => {
        const rest = await restaurantById(db(), c.req.param("id"));
        if (!rest) throw notFound();
        const updated = await staffSetName(deps, rest, c.get("user").userId, c.req.valid("json").name);
        return c.json({ restaurant: updated });
      },
    );
}
