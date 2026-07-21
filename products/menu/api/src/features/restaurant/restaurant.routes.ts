import { identityPatch } from "@iedora/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { menusWithCounts } from "../../data/restaurants.write";
import { menuTree } from "../../data/tree";
import type { MenuDeps } from "../../deps";
import type { MenuEnv } from "../../middleware";
import { seedSample } from "../../seed";
import {
  completeOnboarding,
  deleteRestaurant,
  recordQrPrint,
  renameSlug,
  updateIdentity,
} from "../../service";

// Print-sheet options recorded on the QR audit event (mirrors the dialog).
const qrPrintMeta = z.object({
  kind: z.enum(["menu", "sticker"]),
  code: z.string().max(64).optional(),
  pageSize: z.enum(["a4", "letter", "legal"]),
  qrSizeMm: z.number().int().positive().max(500),
  gutterMm: z.number().int().nonnegative().max(100),
  pageMarginMm: z.number().int().nonnegative().max(100),
  cutMarks: z.boolean(),
  perSheet: z.number().int().nonnegative().max(10_000),
});

// Scoped restaurant-identity slice: everything under /restaurants/{slug} that
// acts on the restaurant as a whole. Relies on the parent `scoped` middleware
// (restaurant resolved + tenancy enforced).
export function restaurantRoutes(deps: MenuDeps) {
  const db = () => deps.db.db;
  return new Hono<MenuEnv>()
    .get("/", async (c) => {
      const rest = c.get("restaurant");
      return c.json({ restaurant: rest, menus: await menusWithCounts(db(), rest.id) });
    })
    .patch("/", zValidator("json", identityPatch), async (c) => {
      const rest = c.get("restaurant");
      await deps.limiter.allow("identity", `org:${rest.tenantId}`);
      return c.json(await updateIdentity(deps, rest, c.req.valid("json")));
    })
    .delete("/", async (c) => {
      await deleteRestaurant(deps, c.get("restaurant"), c.get("user").userId);
      return c.json({ ok: true });
    })
    .post("/slug", zValidator("json", z.object({ slug: z.string() })), async (c) => {
      await renameSlug(deps, c.get("restaurant"), c.get("user").userId, c.req.valid("json").slug);
      return c.json({ ok: true });
    })
    .post("/complete-onboarding", async (c) => {
      await completeOnboarding(deps, c.get("restaurant"));
      return c.json({ ok: true });
    })
    // Audit a QR print from the owner QR page or the admin restaurant view. The
    // scoped middleware already resolved + tenancy-checked the restaurant, so
    // owner (own) and staff (any) both land here; the event targets the
    // restaurant so it surfaces in its admin audit trail.
    .post("/qr-print", zValidator("json", qrPrintMeta), async (c) => {
      await recordQrPrint(deps, c.get("restaurant"), c.get("user").userId, c.req.valid("json"));
      return c.json({ ok: true });
    })
    .post("/seed", async (c) => c.json({ menuId: await seedSample(deps, c.get("restaurant")) }))
    .get("/tree", async (c) => {
      const rest = c.get("restaurant");
      return c.json({
        menus: await menuTree(db(), rest.id, false),
        defaultLanguage: rest.defaultLanguage,
        supportedLanguages: rest.supportedLanguages,
      });
    });
}
