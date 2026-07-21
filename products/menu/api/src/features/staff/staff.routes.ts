import {
  adminSetPasswordRequest,
  staffCreateRestaurant,
  staffImportRestaurant,
  staffReplaceMenus as staffReplaceMenusSchema,
  staffTransferOwnership,
} from "@iedora/contracts";
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
} from "../../data/qr.write.ts";
import { restaurantById } from "../../data/restaurants.ts";
import { staffAlerts, staffDirectory, staffOverview, staffRestaurantById } from "../../data/staff.ts";
import type { MenuDeps } from "../../deps.ts";
import { type MenuEnv, STAFF_ROLE, requireRole } from "../../middleware.ts";
import { generateQRCode, normalizeQRCode, validQRCode } from "../../qr.ts";
import { invalid, notFound } from "../../errors.ts";
import { previewSlug, staffSetName, transferEligibility, transferRestaurant } from "../../service.ts";
import {
  staffCreateRestaurant as provisionRestaurant,
  staffExportMenus,
  staffImportRestaurant as provisionImport,
  staffReplaceMenus,
} from "./provision.ts";

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
const USER_AUDIT_LIMIT = 50; // a user's activity timeline runs longer than a restaurant's

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
    // Slug availability preview for the create form: returns the slug a create
    // would actually assign (the desired base if free, else the next numbered
    // candidate). MUST be registered before "/restaurants/:id" or it'd match as an id.
    .get("/restaurants/slug-preview", async (c) => c.json(await previewSlug(deps, c.req.query("slug") ?? "")))
    // Whether a target tenant can receive another restaurant (plan capacity) —
    // powers the transfer picker's "available / needs Kasa" hint.
    .get("/transfer-eligibility", async (c) => c.json(await transferEligibility(deps, c.req.query("tenant") ?? "")))
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
    // Admin "edit the menu as JSON" for an existing restaurant. GET serializes the
    // live menu tree into the import shape; PUT replaces every menu from a pasted
    // document (the restaurant's identity + languages are untouched).
    .get("/restaurants/:id/menus", async (c) => c.json(await staffExportMenus(deps, c.req.param("id"))))
    .put("/restaurants/:id/menus", zValidator("json", staffReplaceMenusSchema, onInvalid), async (c) => {
      await staffReplaceMenus(deps, c.req.param("id"), c.req.valid("json").menus);
      return c.json({ ok: true });
    })
    // Transfer a restaurant's ownership: to an existing tenant (plan-gated), or
    // to a brand-new user who receives the whole tenant. Audited on the restaurant.
    .post("/restaurants/:id/transfer", zValidator("json", staffTransferOwnership, onInvalid), async (c) => {
      await transferRestaurant(deps, c.req.param("id"), c.get("user").userId, c.req.valid("json"));
      return c.json({ ok: true });
    })
    // Record a (cash) payment against the restaurant's tenant — a manually-entered
    // paid invoice. Staff-only (this whole surface is role-gated).
    .post(
      "/restaurants/:id/payments",
      zValidator(
        "json",
        z.object({
          amountCents: z.number().int().positive(),
          currency: z.string().min(1).default("EUR"),
          planCode: z.string().min(1),
          promo: z.string().min(1).max(80).optional(),
        }),
        onInvalid,
      ),
      async (c) => {
        const rest = await restaurantById(db(), c.req.param("id"));
        if (!rest) throw notFound();
        const b = c.req.valid("json");
        const invoice = await deps.billing.recordPayment({
          tenantId: rest.tenantId,
          planCode: b.planCode,
          amountCents: b.amountCents,
          currency: b.currency,
          promo: b.promo,
          actorId: c.get("user").userId,
        });
        return c.json({ invoice }, 201);
      },
    )
    // Aggregated restaurant detail for the admin pages: the core record + menus +
    // 14-day trend (from this DB), the tenant's billing (subscriptions + invoices,
    // via the billing service), and the tenant + owner (via the auth API). The
    // core record is required (404s for an unknown id); the cross-service reads
    // are best-effort and degrade to empty/null with a logged warning rather
    // than failing the page. The audit trail is NOT loaded here — it's fetched
    // lazily by GET .../audit only when the admin opens the Activity tab, so a
    // record view never touches the audit DB it doesn't display.
    .get("/restaurants/:id", async (c) => {
      const id = c.req.param("id");
      const detail = await staffRestaurantById(db(), id, new Date());
      const tenantId = detail.restaurant.tenantId;
      const [subscriptions, invoices, tenant] = await Promise.all([
        bestEffort("billing.subscriptions", deps.billing.subscriptions(tenantId), []),
        bestEffort("billing.invoices", deps.billing.invoices(tenantId), []),
        bestEffort("tenant", deps.tenant.tenant(tenantId), null),
      ]);
      return c.json({ ...detail, billing: { subscriptions, invoices }, tenant });
    })
    // Lazy activity feed for the restaurant record's Activity tab. Tenant-wide:
    // everything that happened to this restaurant's tenant (payments, plan
    // changes, every restaurant under it), not just this restaurant. Split out
    // of the aggregate so the DB is only queried when the admin opens Activity.
    // 404 for an unknown restaurant so we never scan audit for a bogus id.
    .get("/restaurants/:id/audit", async (c) => {
      const id = c.req.param("id");
      const rest = await restaurantById(db(), id);
      if (!rest) throw notFound();
      return c.json({ events: await deps.audit.forTenant(rest.tenantId, AUDIT_TRAIL_LIMIT) });
    })
    // --- Users CRM (read-only). The auth service owns the user + session reads;
    // the audit service owns the activity timeline (everything the user did).
    // The menu service is the staff BFF that fans out to both. ---
    .get("/users", async (c) => {
      const q = c.req.query("q")?.trim() || undefined;
      return c.json({ users: await deps.tenant.listUsers(q) });
    })
    // User record aggregate: the profile (+ memberships) and the device/session
    // history. The activity timeline is NOT loaded here — the Activity tab
    // fetches it lazily via .../audit so a record view never scans audit it
    // doesn't show (mirrors the restaurant detail). 404 for an unknown user.
    .get("/users/:id", async (c) => {
      const id = c.req.param("id");
      const user = await deps.tenant.getUser(id);
      if (!user) throw notFound();
      const sessions = await bestEffort("user sessions", deps.tenant.getUserSessions(id), []);
      return c.json({ user, sessions });
    })
    // Lazy activity feed for the user record's Activity tab: every event this
    // user is the actor of, across tenants + domains, newest first.
    .get("/users/:id/audit", async (c) => {
      const id = c.req.param("id");
      if (!(await deps.tenant.getUser(id))) throw notFound();
      return c.json({ events: await deps.audit.forActor(id, USER_AUDIT_LIMIT) });
    })
    // Login attempts: the user's sign-in events only (success + failure, with
    // IP + reason), for the Logins tab.
    .get("/users/:id/login-attempts", async (c) => {
      const id = c.req.param("id");
      if (!(await deps.tenant.getUser(id))) throw notFound();
      return c.json({ events: await deps.audit.forActor(id, USER_AUDIT_LIMIT, "auth.session.login") });
    })
    // --- user account actions (the audit trail is emitted here, with the
    // acting staff member as the actor + the managed user as the target). ---
    .post("/users/:id/force-password-change", async (c) => {
      const id = c.req.param("id");
      if (!(await deps.tenant.getUser(id))) throw notFound();
      await deps.tenant.forcePasswordChange(id);
      await deps.auditor.record({
        action: "auth.user.force_password_change",
        actor: { type: "user", id: c.get("user").userId },
        targetType: "user",
        targetId: id,
      });
      return c.json({ ok: true });
    })
    .post("/users/:id/set-password", zValidator("json", adminSetPasswordRequest), async (c) => {
      const id = c.req.param("id");
      if (!(await deps.tenant.getUser(id))) throw notFound();
      await deps.tenant.setUserPassword(id, c.req.valid("json").password);
      await deps.auditor.record({
        action: "auth.user.password_set_by_admin",
        actor: { type: "user", id: c.get("user").userId },
        targetType: "user",
        targetId: id,
      });
      return c.json({ ok: true });
    })
    .post("/users/:id/sessions/:family/revoke", async (c) => {
      const id = c.req.param("id");
      const family = c.req.param("family");
      if (!(await deps.tenant.getUser(id))) throw notFound();
      await deps.tenant.revokeUserSession(id, family);
      await deps.auditor.record({
        action: "auth.session.revoked_by_admin",
        actor: { type: "user", id: c.get("user").userId },
        targetType: "user",
        targetId: id,
        meta: { family },
      });
      return c.json({ ok: true });
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
