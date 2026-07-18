import type { PublicPayload } from "@iedora/contracts";
import { SpanStatusCode, trace, tracer } from "@iedora/menu-kit";
import { IEDORA_RESTAURANT_ID, IEDORA_TENANT_ID, tenantContext } from "@iedora/observability";
import { type Context, Hono } from "hono";
import { getConnInfo } from "hono/bun";
import { getCookie, setCookie } from "hono/cookie";
import type { Kysely } from "kysely";

import { resolveQRCode } from "../../data/qr";
import { restaurantBySlug } from "../../data/restaurants";
import { menuContentVersion, menuTree } from "../../data/tree";
import { recordItemViews, recordSession, recordView } from "../../data/views";
import type { MenuDeps } from "../../deps";
import type { Restaurant } from "../../domain";
import { notFound } from "../../errors";
import { localize, pick, pickLanguage } from "../../i18n";
import type { MenuDB } from "../../schema";

// Public surface: unauthenticated, slug-addressed, read-only (plus the
// fire-and-forget view beacon). The React app renders straight from these.

// A 1x1 transparent GIF; the beacon always answers with it (and 200) so a guest
// page never sees tracking errors.
const PIXEL = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

const VISITOR_COOKIE = "mm_v";
const YEAR_SECONDS = 365 * 24 * 60 * 60;

// Crude UA deny-list — fail-open by design; the per-hour visitor dedup absorbs
// what slips through.
const BOT_MARKERS = ["bot", "crawl", "spider", "preview", "headless", "curl", "wget"];
function isBot(ua: string): boolean {
  const l = ua.toLowerCase();
  return BOT_MARKERS.some((m) => l.includes(m));
}

// clientIP identifies the caller for the beacon rate limiter. In production the
// service sits behind a Cloudflare tunnel that sets CF-Connecting-IP (and
// overwrites any client value); otherwise we key on the socket peer. We
// deliberately do NOT trust a raw X-Forwarded-For (a direct client could rotate
// it to mint unlimited buckets).
function clientIP(c: Context): string {
  const cf = c.req.header("cf-connecting-ip")?.trim();
  if (cf) return cf;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // no socket peer (e.g. in-process app.request)
  }
}

function setPublicRoute(route: string, method: string): void {
  const span = trace.getActiveSpan();
  span?.updateName(`${method} ${route}`);
  span?.setAttribute("http.route", route);
  span?.setAttribute("public.route", route);
}

function setRestaurantAttrs(rest: Restaurant): void {
  const span = trace.getActiveSpan();
  span?.setAttribute(IEDORA_RESTAURANT_ID, rest.id);
  span?.setAttribute(IEDORA_TENANT_ID, rest.tenantId);
  span?.setAttribute("restaurant.id", rest.id);
  span?.setAttribute("restaurant.slug", rest.slug);
}

function recordPublicError(err: unknown, operation: string): void {
  const span = trace.getActiveSpan();
  span?.recordException(err instanceof Error ? err : String(err));
  span?.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
  span?.setAttribute("public.error", true);
  span?.setAttribute("public.operation", operation);
}

async function publicRestaurantBySlug(db: Kysely<MenuDB>, slug: string): Promise<Restaurant | undefined> {
  return tracer.startActiveSpan("public.restaurant.lookup", async (span) => {
    span.setAttribute("restaurant.slug", slug);
    try {
      const rest = await restaurantBySlug(db, slug);
      if (rest) {
        span.setAttribute(IEDORA_RESTAURANT_ID, rest.id);
        span.setAttribute(IEDORA_TENANT_ID, rest.tenantId);
        span.setAttribute("restaurant.id", rest.id);
        span.setAttribute("restaurant.slug", rest.slug);
      }
      return rest;
    } catch (err) {
      span.recordException(err instanceof Error ? err : String(err));
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}

export function publicRoutes(deps: MenuDeps) {
  const db = () => deps.db.db;

  // Per-process cache of the LOCALIZED menu tree, keyed by restaurant+language and
  // versioned by the menu's newest updated_at. The hot guest path then skips the
  // 3 tree queries + JSON-parse + localize on a hit; the cheap version probe makes
  // any menu write invalidate the entry automatically (no stale menus). Restaurant
  // identity is still loaded fresh each request, so renames/theme changes show at
  // once. Bounded; oldest entry evicted on overflow.
  const PUBLIC_MENU_CACHE_MAX = 300;
  const menuCache = new Map<string, { version: string; menus: PublicPayload["menus"] }>();

  return new Hono()
    // publicMenu renders one restaurant's active menus in the negotiated language.
    .get("/r/:slug", async (c) => {
      setPublicRoute("/public/r/:slug", c.req.method);
      const rest = await publicRestaurantBySlug(db(), c.req.param("slug"));
      if (!rest) throw notFound();
      // Attribute the request span (IP is already on it) and propagate tenant to
      // every child span — the menu-content + tree DB spans below inherit
      // tenant.id / tenant.restaurant_id via the TenantContextSpanProcessor.
      tenantContext.enterWith({ restaurantId: rest.id, tenantId: rest.tenantId });
      setRestaurantAttrs(rest);
      const span = trace.getActiveSpan();

      const lang = pickLanguage(
        c.req.query("lang") ?? "",
        c.req.header("accept-language") ?? "",
        rest.supportedLanguages,
        rest.defaultLanguage,
      );
      span?.setAttribute("menu.language", lang);

      const version = await menuContentVersion(db(), rest.id);
      const key = `${rest.id}:${lang}`;
      let entry = menuCache.get(key);
      const cacheHit = !!entry && entry.version === version;
      span?.setAttribute("menu.cache", cacheHit ? "hit" : "miss");
      if (!entry || entry.version !== version) {
        const tree = await menuTree(db(), rest.id, true);
        entry = { version, menus: localize(tree, lang) };
        if (menuCache.size >= PUBLIC_MENU_CACHE_MAX) {
          const oldest = menuCache.keys().next().value; // insertion order → evict oldest
          if (oldest !== undefined) menuCache.delete(oldest);
        }
        menuCache.set(key, entry);
      }

      const payload: PublicPayload = {
        restaurant: {
          name: rest.name,
          slug: rest.slug,
          description: pick(rest.description, rest.descriptionI18n, lang) || undefined,
          logoUrl: rest.logoUrl || undefined,
          bannerUrl: rest.bannerUrl || undefined,
          theme: rest.theme ?? undefined,
        },
        menus: entry.menus,
        defaultLanguage: rest.defaultLanguage,
        supportedLanguages: rest.supportedLanguages,
        currentLanguage: lang,
      };
      return c.json(payload);
    })
    // resolveQR maps a sticker code to its restaurant slug — the scan hot path.
    .get("/qr/:code", async (c) => {
      setPublicRoute("/public/qr/:code", c.req.method);
      const slug = await resolveQRCode(db(), c.req.param("code"));
      if (slug === undefined) throw notFound();
      trace.getActiveSpan()?.setAttribute("restaurant.slug", slug);
      return c.json({ slug });
    })
    // trackView counts one public menu view: bot filter → IP rate limit →
    // visitor cookie → dedup + counter. Every failure path still returns the
    // pixel (and 200) so a guest page never sees tracking errors.
    .get("/track/:slug", async (c) => {
      setPublicRoute("/public/track/:slug", c.req.method);
      const slug = c.req.param("slug");
      trace.getActiveSpan()?.setAttribute("restaurant.slug", slug);
      const servePixel = () => {
        c.header("Content-Type", "image/gif");
        c.header("Cache-Control", "no-store");
        return c.body(PIXEL);
      };

      if (isBot(c.req.header("user-agent") ?? "")) return servePixel();
      try {
        await deps.limiter.allow("beacon", `ip:${clientIP(c)}`);
        const rest = await publicRestaurantBySlug(db(), slug); // beacon needs only the restaurant, not the menu tree
        if (!rest) return servePixel();
        tenantContext.enterWith({ restaurantId: rest.id, tenantId: rest.tenantId });
        setRestaurantAttrs(rest);
        // Bound inflation per restaurant — defeats IP/cookie rotation.
        await deps.limiter.allow("beacon_rest", `rest:${rest.id}`);

        let visitor = getCookie(c, VISITOR_COOKIE) ?? "";
        if (!visitor) {
          visitor = crypto.randomUUID();
          setCookie(c, VISITOR_COOKIE, visitor, {
            path: "/",
            maxAge: YEAR_SECONDS,
            httpOnly: true,
            sameSite: "Lax",
          });
        }
        const lang = pickLanguage(
          c.req.query("lang") ?? "",
          c.req.header("accept-language") ?? "",
          rest.supportedLanguages,
          rest.defaultLanguage,
        );
        trace.getActiveSpan()?.setAttribute("menu.language", lang);
        await recordView(db(), rest, visitor, lang, new Date());
      } catch (err) {
        recordPublicError(err, "track.view");
        // fire-and-forget: any rate-limit/db error still serves the pixel
      }
      return servePixel();
    })
    // Session-end beacon (navigator.sendBeacon on page hide): records the
    // guest's dwell time and the set of dish ids that scrolled into view, in
    // one fire-and-forget request. Powers "Avg. time" + "Top dishes".
    .post("/track/:slug/session", async (c) => {
      setPublicRoute("/public/track/:slug/session", c.req.method);
      const slug = c.req.param("slug");
      trace.getActiveSpan()?.setAttribute("restaurant.slug", slug);
      try {
        await deps.limiter.allow("beacon", `ip:${clientIP(c)}`);
        const rest = await publicRestaurantBySlug(db(), slug); // beacon needs only the restaurant, not the menu tree
        if (!rest) return c.body(null, 204);
        tenantContext.enterWith({ restaurantId: rest.id, tenantId: rest.tenantId });
        setRestaurantAttrs(rest);
        await deps.limiter.allow("beacon_rest", `rest:${rest.id}`);
        const visitor = getCookie(c, VISITOR_COOKIE) ?? "";
        const body = (await c.req.json().catch((err) => {
          recordPublicError(err, "track.session.parse");
          return {};
        })) as {
          durationSeconds?: unknown;
          items?: unknown;
        };
        const now = new Date();
        if (typeof body.durationSeconds === "number" && body.durationSeconds > 0) {
          await recordSession(db(), rest, body.durationSeconds, now);
        }
        if (visitor && Array.isArray(body.items)) {
          const itemIds = body.items
            .filter((x): x is string => typeof x === "string" && x.length > 0)
            .slice(0, 100);
          if (itemIds.length) await recordItemViews(db(), rest, itemIds, visitor, now);
        }
      } catch (err) {
        recordPublicError(err, "track.session");
        // fire-and-forget
      }
      return c.body(null, 204);
    });
}
