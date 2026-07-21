import { type Kysely, sql } from "kysely";

import type { Restaurant } from "../domain.ts";
import type { MenuDB } from "../schema.ts";
import { dayString } from "./sqlutil.ts";

// Public-view metrics, two-table atomic pattern. view_seen dedups one count per
// visitor/restaurant/hour; daily_view
// accumulates per-day-per-language counters. All bucketing is UTC.

function hourBucket(t: Date): string {
  return `${dayString(t)}-${String(t.getUTCHours()).padStart(2, "0")}`; // YYYY-MM-DD-HH
}

// recordView counts one public menu view in a single atomic statement: the
// dedup insert wins at most once per visitor/restaurant/hour, and only that
// winning row drives the daily-counter increment (CTE → conditional upsert).
// Genuinely idempotent under retries.
export async function recordView(
  db: Kysely<MenuDB>,
  r: Restaurant,
  visitorId: string,
  language: string,
  now: Date,
): Promise<void> {
  await sql`
    WITH won AS (
      INSERT INTO view_seen (visitor_id, restaurant_id, hour_bucket)
      VALUES (${visitorId}, ${r.id}, ${hourBucket(now)}) ON CONFLICT DO NOTHING
      RETURNING 1)
    INSERT INTO daily_view (restaurant_id, tenant_id, day, language, count)
    SELECT ${r.id}, ${r.tenantId}, ${dayString(now)}, ${language}, 1 FROM won
    ON CONFLICT (restaurant_id, day, language) DO UPDATE SET count = daily_view.count + 1
  `.execute(db);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// recordItemViews counts a whole batch of per-item views in ONE statement (the
// session-end beacon carries the set of dish ids that scrolled into view). Same
// per-visitor/item/DAY dedup as before, but set-based: filter ids to ones owned
// by the restaurant, dedup-insert the seen rows, and increment only the winners.
// Replaces the old per-item N+1 loop (up to 100 round-trips). Ids are validated
// to UUID shape in JS so the `::uuid[]` cast can't fail on a malformed id and
// abort the whole batch.
export async function recordItemViews(
  db: Kysely<MenuDB>,
  r: Restaurant,
  itemIds: string[],
  visitorId: string,
  now: Date,
): Promise<void> {
  const ids = Array.from(new Set(itemIds.filter((id) => UUID_RE.test(id))));
  if (ids.length === 0) return;
  const day = dayString(now);
  const idList = sql.join(ids.map((id) => sql`${id}`)); // $1, $2, … — each id its own param
  await sql`
    WITH owned AS (
      SELECT i.id AS item_id FROM items i
      WHERE i.restaurant_id = ${r.id} AND i.id IN (${idList})),
    won AS (
      INSERT INTO item_view_seen (visitor_id, item_id, day)
      SELECT ${visitorId}, owned.item_id, ${day} FROM owned
      ON CONFLICT DO NOTHING
      RETURNING item_id)
    INSERT INTO item_view (restaurant_id, tenant_id, item_id, day, count)
    SELECT ${r.id}, ${r.tenantId}, won.item_id, ${day}, 1 FROM won
    ON CONFLICT (item_id, day) DO UPDATE SET count = item_view.count + 1
  `.execute(db);
}

// recordSession stores one guest session duration (clamped to a sane range so
// a tab left open overnight doesn't skew the average). Raw rows; the average
// is computed at read time over the requested range.
export async function recordSession(
  db: Kysely<MenuDB>,
  r: Restaurant,
  durationSeconds: number,
  now: Date,
): Promise<void> {
  const clamped = Math.max(1, Math.min(3600, Math.round(durationSeconds)));
  await sql`
    INSERT INTO menu_session (restaurant_id, tenant_id, day, duration_seconds)
    VALUES (${r.id}, ${r.tenantId}, ${dayString(now)}, ${clamped})
  `.execute(db);
}
