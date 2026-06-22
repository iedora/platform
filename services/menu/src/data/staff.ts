import { type Kysely, sql } from "kysely";

import type { MenuDB } from "../schema";
import type { DailyPoint } from "./analytics";
import { notFound } from "../errors";
import { type MenuSummary, menusWithCounts } from "./restaurants.write";
import { addDays, dayString } from "./sqlutil";

// Cross-tenant read models for the staff admin console. Every query spans all
// tenants by design (staff oversight); pure reads, no writes.

type DB = Kysely<MenuDB>;

export interface StaffRestaurantRow {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  menus: number;
  items: number;
  views30d: number;
  createdAt: string;
}

export interface StaffOverview {
  restaurants: number;
  activeMenus: number;
  items: number;
  viewsToday: number;
  views30d: number;
  qrBound: number;
  qrUnbound: number;
  topByViews: StaffRestaurantRow[];
}

export interface StaffRestaurantDetail {
  restaurant: StaffRestaurantRow;
  menus: MenuSummary[];
  trend: DailyPoint[];
}

export interface StaffAlerts {
  staleRestaurants: StaffRestaurantRow[];
  emptyMenus: StaffRestaurantRow[];
  unboundQr: number;
}


// window30 is the inclusive UTC start-of-day 29 days before now (30 days incl. today).
function window30(now: Date): string {
  return dayString(addDays(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), -29));
}

// ROW_COLS is the directory projection shared by every staff list query:
// identity + correlated content counts + 30-day reach (cutoff `since`).
const ROW_COLS = (since: string) => sql`
  r.id, r.tenant_id, r.name, r.slug,
  (SELECT count(*)::int FROM menus m WHERE m.restaurant_id = r.id) AS menus,
  (SELECT count(*)::int FROM items i WHERE i.restaurant_id = r.id) AS items,
  (SELECT coalesce(sum(dv.count),0)::int FROM daily_view dv WHERE dv.restaurant_id = r.id AND dv.day >= ${since}) AS views30d,
  r.created_at`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRow(r: any): StaffRestaurantRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    slug: r.slug,
    menus: Number(r.menus),
    items: Number(r.items),
    views30d: Number(r.views30d),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function staffOverview(db: DB, now: Date): Promise<StaffOverview> {
  const since = window30(now);
  const head = await sql<{
    restaurants: number;
    active_menus: number;
    items: number;
    views_today: number;
    views_30d: number;
    qr_bound: number;
    qr_unbound: number;
  }>`
    SELECT
      (SELECT count(*)::int FROM restaurants) AS restaurants,
      (SELECT count(*)::int FROM menus WHERE active) AS active_menus,
      (SELECT count(*)::int FROM items) AS items,
      (SELECT coalesce(sum(count),0)::int FROM daily_view WHERE day = ${dayString(now)}) AS views_today,
      (SELECT coalesce(sum(count),0)::int FROM daily_view WHERE day >= ${since}) AS views_30d,
      (SELECT count(*)::int FROM qr_codes WHERE bound_at IS NOT NULL) AS qr_bound,
      (SELECT count(*)::int FROM qr_codes WHERE bound_at IS NULL) AS qr_unbound`.execute(db);
  const h = head.rows[0]!;

  const top = await sql`
    SELECT ${ROW_COLS(since)} FROM restaurants r
    ORDER BY (SELECT coalesce(sum(dv.count),0) FROM daily_view dv WHERE dv.restaurant_id = r.id AND dv.day >= ${since}) DESC,
      r.created_at DESC
    LIMIT 5`.execute(db);

  return {
    restaurants: Number(h.restaurants),
    activeMenus: Number(h.active_menus),
    items: Number(h.items),
    viewsToday: Number(h.views_today),
    views30d: Number(h.views_30d),
    qrBound: Number(h.qr_bound),
    qrUnbound: Number(h.qr_unbound),
    topByViews: top.rows.map(toRow),
  };
}

export async function staffDirectory(db: DB, q: string, now: Date): Promise<StaffRestaurantRow[]> {
  const since = window30(now);
  const rows = await sql`
    SELECT ${ROW_COLS(since)} FROM restaurants r
    WHERE (${q} = '' OR r.name ILIKE '%'||${q}||'%' OR r.slug ILIKE '%'||${q}||'%')
    ORDER BY r.created_at DESC LIMIT 200`.execute(db);
  return rows.rows.map(toRow);
}

export async function staffRestaurantById(db: DB, id: string, now: Date): Promise<StaffRestaurantDetail> {
  const since = window30(now);
  const row = await sql`SELECT ${ROW_COLS(since)} FROM restaurants r WHERE r.id = ${id}`.execute(db);
  if (row.rows.length === 0) throw notFound();
  const restaurant = toRow(row.rows[0]);

  const menus = await menusWithCounts(db, id);

  const TREND_DAYS = 13; // 14 points incl. today
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const counts = new Map<string, number>();
  const points = await sql<{ day: string; count: number }>`
    SELECT day, sum(count)::int AS count FROM daily_view
    WHERE restaurant_id = ${id} AND day >= ${dayString(addDays(today, -TREND_DAYS))} GROUP BY day`.execute(db);
  for (const p of points.rows) counts.set(p.day, Number(p.count));
  const trend: DailyPoint[] = [];
  for (let i = -TREND_DAYS; i <= 0; i++) {
    const day = dayString(addDays(today, i));
    trend.push({ day, count: counts.get(day) ?? 0 });
  }
  return { restaurant, menus, trend };
}

export async function staffAlerts(db: DB, now: Date): Promise<StaffAlerts> {
  const since = window30(now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const stale = await sql`
    SELECT ${ROW_COLS(since)} FROM restaurants r
    WHERE r.created_at < ${weekAgo}
      AND NOT EXISTS (SELECT 1 FROM daily_view dv WHERE dv.restaurant_id = r.id AND dv.day >= ${since})
    ORDER BY r.created_at LIMIT 100`.execute(db);

  const empty = await sql`
    SELECT ${ROW_COLS(since)} FROM restaurants r
    WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.restaurant_id = r.id)
    ORDER BY r.created_at LIMIT 100`.execute(db);

  const unbound = await sql<{ n: number }>`SELECT count(*)::int AS n FROM qr_codes WHERE bound_at IS NULL`.execute(db);

  return {
    staleRestaurants: stale.rows.map(toRow),
    emptyMenus: empty.rows.map(toRow),
    unboundQr: Number(unbound.rows[0]!.n),
  };
}
