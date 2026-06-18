import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
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
import { staffAlerts, staffDirectory, staffOverview, staffRestaurantById } from "../../data/staff";
import type { MenuDeps } from "../../deps";
import { type MenuEnv, STAFF_ROLE, requireRole } from "../../middleware";
import { generateQRCode, normalizeQRCode, validQRCode } from "../../qr";
import { invalid } from "../../errors";

const MAX_BULK_QR = 500;

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
// Mounted under /api/staff behind requireRole(STAFF_ROLE). Ports Go
// internal/menu/httpapi/staff.go.
export function staffRoutes(deps: MenuDeps) {
  const db = () => deps.db.db;
  return new Hono<MenuEnv>()
    .use(requireRole(STAFF_ROLE))
    .get("/overview", async (c) => c.json(await staffOverview(db(), new Date())))
    .get("/directory", async (c) =>
      c.json({ restaurants: await staffDirectory(db(), c.req.query("q") ?? "", new Date()) }),
    )
    .get("/directory/:id", async (c) => c.json(await staffRestaurantById(db(), c.req.param("id"), new Date())))
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
    .get("/restaurants", async (c) => c.json({ restaurants: await listRestaurantRefs(db()) }));
}
