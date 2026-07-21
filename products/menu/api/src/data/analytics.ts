import { type Kysely, sql } from "kysely";

import type { MenuDB } from "../schema.ts";
import { invalid } from "../errors.ts";
import { Languages } from "../i18n.ts";
import { addDays, dayString } from "./sqlutil.ts";

// Dashboard analytics + the AI-quota ledger.

type DB = Kysely<MenuDB>;

// MonthlyViews sums the tenant's views for the current calendar month (UTC).
export async function monthlyViews(db: DB, tenantId: string, now: Date): Promise<number> {
  const first = dayString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const r = await sql<{ n: string }>`
    SELECT coalesce(sum(count),0)::text AS n FROM daily_view WHERE tenant_id=${tenantId} AND day >= ${first}`.execute(db);
  return Number(r.rows[0]!.n);
}

export const AnalyticsRanges: Record<string, number> = { today: 0, "7d": 6, "30d": 29 };

export interface DailyPoint {
  day: string;
  count: number;
}

export interface TopDish {
  itemId: string;
  itemName: string;
  viewCount: number;
}

export interface Analytics {
  range: string;
  totalScans: number;
  todayScans: number;
  dailyBreakdown: DailyPoint[];
  menus: { total: number; active: number };
  dishes: { total: number; lastAddedAt: string | null };
  languages: string[];
  topDishes: TopDish[];
  avgSessionSeconds: number | null;
}

// analytics aggregates the tenant's scans + content state for a range key from
// AnalyticsRanges. Missing days are filled with zeroes, oldest first.
export async function analytics(
  db: DB,
  tenantId: string,
  rangeKey: string,
  now: Date,
): Promise<Analytics> {
  const days = AnalyticsRanges[rangeKey];
  if (days === undefined) throw invalid("unknown analytics range");
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = dayString(addDays(today, -days));

  const a: Analytics = {
    range: rangeKey,
    totalScans: 0,
    todayScans: 0,
    dailyBreakdown: [],
    menus: { total: 0, active: 0 },
    dishes: { total: 0, lastAddedAt: null },
    languages: [],
    topDishes: [],
    avgSessionSeconds: null,
  };

  const counts = new Map<string, number>();
  const pointRows = await sql<{ day: string; count: number }>`
    SELECT day, sum(count)::int AS count FROM daily_view
    WHERE tenant_id=${tenantId} AND day >= ${start} GROUP BY day`.execute(db);
  for (const p of pointRows.rows) {
    counts.set(p.day, Number(p.count));
    a.totalScans += Number(p.count);
  }
  a.todayScans = counts.get(dayString(today)) ?? 0;
  for (let d = -days; d <= 0; d++) {
    const day = dayString(addDays(today, d));
    a.dailyBreakdown.push({ day, count: counts.get(day) ?? 0 });
  }

  const content = await sql<{
    menus_total: string;
    menus_active: string;
    dishes_total: string;
    last_added: Date | null;
  }>`
    SELECT
      (SELECT count(*) FROM menus m JOIN restaurants r ON r.id=m.restaurant_id WHERE r.tenant_id=${tenantId}) AS menus_total,
      (SELECT count(*) FROM menus m JOIN restaurants r ON r.id=m.restaurant_id WHERE r.tenant_id=${tenantId} AND m.active) AS menus_active,
      (SELECT count(*) FROM items i JOIN restaurants r ON r.id=i.restaurant_id WHERE r.tenant_id=${tenantId}) AS dishes_total,
      (SELECT max(i.created_at) FROM items i JOIN restaurants r ON r.id=i.restaurant_id WHERE r.tenant_id=${tenantId}) AS last_added`.execute(db);
  const c = content.rows[0]!;
  a.menus.total = Number(c.menus_total);
  a.menus.active = Number(c.menus_active);
  a.dishes.total = Number(c.dishes_total);
  a.dishes.lastAddedAt = c.last_added ? new Date(c.last_added).toISOString() : null;

  // Union of every restaurant's supported languages, registry-ordered.
  const langRows = await sql<{ lang: string }>`
    SELECT DISTINCT unnest(r.supported_languages) AS lang FROM restaurants r WHERE r.tenant_id=${tenantId}`.execute(db);
  const set = new Set(langRows.rows.map((r) => r.lang));
  a.languages = Languages.filter((l) => set.has(l));

  // Top dishes — most-viewed items over the range (current item name).
  const topRows = await sql<{ item_id: string; item_name: string; views: number }>`
    SELECT iv.item_id, i.name AS item_name, sum(iv.count)::int AS views
    FROM item_view iv JOIN items i ON i.id = iv.item_id
    WHERE iv.tenant_id=${tenantId} AND iv.day >= ${start}
    GROUP BY iv.item_id, i.name
    ORDER BY views DESC
    LIMIT 5`.execute(db);
  a.topDishes = topRows.rows.map((r) => ({
    itemId: r.item_id,
    itemName: r.item_name,
    viewCount: Number(r.views),
  }));

  // Average guest dwell time over the range (whole seconds, null if no data).
  const sessRows = await sql<{ avg: number | null }>`
    SELECT round(avg(duration_seconds))::int AS avg FROM menu_session
    WHERE tenant_id=${tenantId} AND day >= ${start}`.execute(db);
  const avg = sessRows.rows[0]?.avg;
  a.avgSessionSeconds = avg == null ? null : Number(avg);

  return a;
}

// --- AI generation quota ledger ---

export async function countAIGenerationsSince(db: DB, tenantId: string, since: Date): Promise<number> {
  const r = await sql<{ n: string }>`
    SELECT count(*)::text AS n FROM ai_generations WHERE tenant_id=${tenantId} AND created_at > ${since}`.execute(db);
  return Number(r.rows[0]!.n);
}

export async function insertAIGeneration(db: DB, tenantId: string): Promise<void> {
  await sql`INSERT INTO ai_generations (tenant_id) VALUES (${tenantId})`.execute(db);
}
